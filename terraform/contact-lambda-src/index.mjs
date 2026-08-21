// Contact form gateway Lambda (Function URL, payload v2.0).
// Runs 10 anti-abuse controls IN ORDER (cheapest-first / fail-fast), then
// emails the owner directly via SESv2.
// ZERO npm deps: node:crypto, global fetch, @aws-sdk/client-{ssm,dynamodb,sesv2}
// (all bundled in the nodejs22.x runtime, imported dynamically — verified on
// nodejs22.x/arm64, not assumed).
//
// Env contract (set by infra / terraform):
//   TURNSTILE_SECRET_PARAM   SSM SecureString name holding the Turnstile secret
//   MAIL_FROM                 verified SES sender, e.g. noreply@<domain>. Pinned
//                             by a ses:FromAddress condition on BOTH the role
//                             policy and the permissions boundary — changing it
//                             here alone gets sends denied at runtime.
//   MAIL_FROM_NAME            display name for the From header
//   MAIL_TO                   owner notification recipient (must be on a
//                             verified domain while SES is in the sandbox)
//   DDB_TABLE                 DynamoDB table name (pk: S, ttl attr: expires_at)
//   ALLOWED_ORIGINS         comma-separated exact Origins (CORS allowlist)
//   ALLOWED_HOSTNAMES       comma-separated Turnstile hostnames to accept
//   TURNSTILE_ACTION        expected Turnstile action (e.g. "contact")
//
// Reserved concurrency: DO NOT set (account limit is low). See webhook.tf note.

import { createHash, randomUUID } from "node:crypto";

// ---- tuning constants (see the 10 controls below) ---------------------------
// Control 3. Sized so the ADVERTISED 4,000-character message limit is actually
// deliverable in every script, which 8192 was not: the cap is bytes and the
// schema limit is characters, so for a multibyte script the byte cap bound far
// below the limit the UI showed. A 4,000-char message plus the ~2 KB Turnstile
// token and JSON overhead is ~6.2 KB in ASCII, ~10.2 KB at 2 bytes/char
// (Cyrillic, Greek) and ~14.2 KB at 3 bytes/char (CJK) — so a Japanese or
// Russian enquirer hit a 413 the form never warned about.
//
// Deliberately 2x, not more: this control exists to reject oversized bodies
// BEFORE the JSON parse and before the outbound siteverify call, so it has to
// stay a real bound. The client validates the same limit in bytes (see the
// hand-synced pair note in src/components/Contact.tsx).
const MAX_BODY_BYTES = 16384;
const TOKEN_MAX_AGE_S = 300; // control 7: reject challenge_ts older than this
const MIN_FORM_TIME_S = 3; // control 7: reject submissions faster than this
const TOKEN_TTL_S = 600; // control 7: replay guard row lifetime
const IP_WINDOW_S = 600; // control 8 (per-IP; runs BEFORE siteverify)
const IP_MAX = 5;
const GLOBAL_WINDOW_S = 600; // pre-siteverify all-IP burst backstop
const GLOBAL_MAX = 60; // >> any plausible legit volume for this form
const EMAIL_WINDOW_S = 3600; // control 9
const EMAIL_MAX = 3;
const DUP_TTL_S = 86400; // control 10
// Grace added to a rate-limit bucket's TTL so DynamoDB's reaper cannot delete
// a window that is still live (clock skew + reaper jitter). Buckets are keyed
// by window, so TTL is only garbage collection — see bumpCounter.
const TTL_GRACE_S = 300;

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// C0 control chars + DEL; strict variant allows \t \n \r (multiline message).
//
// Matching control characters IS the point here — these reject CR/LF and friends
// in submitted fields so they cannot be smuggled into the SES subject or
// Reply-To as header injection. So no-control-regex is disabled deliberately,
// narrowly, and only for these two lines. Note they use \x escapes, not literal
// bytes: a raw control character in source is invisible in review (and a raw NUL
// makes git treat the whole file as binary).
/* eslint-disable no-control-regex */
const CTRL_ANY = /[\x00-\x1F\x7F]/;
const CTRL_MULTILINE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
/* eslint-enable no-control-regex */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function env() {
  return {
    TURNSTILE_SECRET_PARAM: process.env.TURNSTILE_SECRET_PARAM,
    MAIL_FROM: process.env.MAIL_FROM,
    MAIL_FROM_NAME: process.env.MAIL_FROM_NAME ?? "Contact form",
    MAIL_TO: process.env.MAIL_TO,
    DDB_TABLE: process.env.DDB_TABLE,
    allowedOrigins: splitCsv(
      process.env.ALLOWED_ORIGINS ??
        "https://agusgonzaleznic.com,https://www.agusgonzaleznic.com",
    ),
    allowedHostnames: splitCsv(
      process.env.ALLOWED_HOSTNAMES ??
        "agusgonzaleznic.com,www.agusgonzaleznic.com",
    ),
    action: process.env.TURNSTILE_ACTION ?? "contact",
  };
}

function splitCsv(s) {
  return String(s)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// ---- injectable dependency layer (real paths lazy-load the SDK) -------------
// Tests override these; production leaves them null and hits AWS/network.
let _ddbSend = null; // (op, params) => Promise<result>
let _getParamOverride = null; // (name) => Promise<string>
let _sesSend = null; // (params) => Promise<result>
let _ddbClient = null;
let _ssmClient = null;
let _sesClient = null;

// Limits/windows exported for tests so assertions cannot drift from behaviour.
export const __limits = {
  MAX_BODY_BYTES,
  IP_WINDOW_S,
  IP_MAX,
  GLOBAL_WINDOW_S,
  GLOBAL_MAX,
  EMAIL_WINDOW_S,
  EMAIL_MAX,
  DUP_TTL_S,
  TTL_GRACE_S,
};

export function __setTestDeps({ ddbSend, getParam, sesSend } = {}) {
  if (ddbSend !== undefined) _ddbSend = ddbSend;
  if (getParam !== undefined) _getParamOverride = getParam;
  if (sesSend !== undefined) _sesSend = sesSend;
}
export function __resetTestDeps() {
  _ddbSend = null;
  _getParamOverride = null;
  _sesSend = null;
  paramCache.clear();
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const paramCache = new Map(); // name -> { value, expiresAt }

async function getParam(name) {
  if (_getParamOverride) return _getParamOverride(name);
  const hit = paramCache.get(name);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const { SSMClient, GetParameterCommand } = await import(
    "@aws-sdk/client-ssm"
  );
  _ssmClient ??= new SSMClient({});
  const res = await _ssmClient.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );
  const value = res.Parameter?.Value;
  paramCache.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function ddb(op, params) {
  if (_ddbSend) return _ddbSend(op, params);
  const sdk = await import("@aws-sdk/client-dynamodb");
  _ddbClient ??= new sdk.DynamoDBClient({});
  const Command = op === "PutItem" ? sdk.PutItemCommand : sdk.UpdateItemCommand;
  return _ddbClient.send(new Command(params));
}

async function sesSend(params) {
  if (_sesSend) return _sesSend(params);
  const sdk = await import("@aws-sdk/client-sesv2");
  _sesClient ??= new sdk.SESv2Client({});
  return _sesClient.send(new sdk.SendEmailCommand(params));
}

function isConditionalFail(err) {
  return err?.name === "ConditionalCheckFailedException";
}

// ---- response helpers -------------------------------------------------------
function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    // The production form is same-origin (no preflight). These headers only
    // matter for the defensive cross-origin path; the client sends just
    // Content-Type.
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function respond(statusCode, body, origin, extraHeaders = undefined) {
  const headers = { "content-type": "application/json" };
  if (origin) Object.assign(headers, corsHeaders(origin));
  if (extraHeaders) Object.assign(headers, extraHeaders);
  return { statusCode, headers, body: JSON.stringify(body) };
}

// ---- crypto helpers ---------------------------------------------------------
function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}

// CloudFront-Viewer-Address is "IP:PORT"; the IP itself may contain colons
// (IPv6), so strip everything after the LAST colon.
function parseViewerAddress(raw) {
  if (typeof raw !== "string" || !raw) return "unknown";
  const i = raw.lastIndexOf(":");
  return i > 0 ? raw.slice(0, i) : raw;
}

// Rate-limit key for an IP. IPv6 callers get a whole /64 (or larger) from their
// ISP, so keying on the full address lets an attacker rotate through 2^64
// addresses to defeat the per-IP limit; bucket IPv6 to its /64 first. IPv4 and
// "unknown" pass through unchanged.
function ipRateKey(ip) {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::"); // valid IPv6 has at most one "::"
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const fill = Array(Math.max(0, 8 - headParts.length - tailParts.length)).fill(
    "0",
  );
  const full = [...headParts, ...fill, ...tailParts];
  return `${full.slice(0, 4).join(":")}::/64`;
}

// ---- control 4: schema validation ------------------------------------------
const ALLOWED_KEYS = new Set([
  "name",
  "email",
  "role",
  "message",
  "turnstileToken",
  "company_website",
]);

function validate(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "invalid" };
  }
  for (const k of Object.keys(payload)) {
    if (!ALLOWED_KEYS.has(k)) return { error: "invalid" }; // unknown key
  }
  const str = (v) => (typeof v === "string" ? v : undefined);

  const name = str(payload.name)?.trim();
  const email = str(payload.email)?.trim();
  const role = payload.role === undefined ? "" : str(payload.role)?.trim();
  const message = str(payload.message)?.trim();
  const token = str(payload.turnstileToken)?.trim();
  const honeypot =
    payload.company_website === undefined
      ? ""
      : str(payload.company_website);

  if (name === undefined || email === undefined || message === undefined) {
    return { error: "invalid" };
  }
  if (token === undefined || payload.role !== undefined && role === undefined) {
    return { error: "invalid" };
  }
  if (payload.company_website !== undefined && honeypot === undefined) {
    return { error: "invalid" };
  }
  if (name.length < 1 || name.length > 100 || CTRL_ANY.test(name)) {
    return { error: "invalid" };
  }
  if (
    email.length < 1 ||
    email.length > 200 ||
    !EMAIL_RE.test(email) ||
    CTRL_ANY.test(email)
  ) {
    return { error: "invalid" };
  }
  if (role.length > 100 || CTRL_ANY.test(role)) return { error: "invalid" };
  if (
    message.length < 10 ||
    message.length > 4000 ||
    CTRL_MULTILINE.test(message)
  ) {
    return { error: "invalid" };
  }
  if (token.length < 1 || token.length > 2048 || CTRL_ANY.test(token)) {
    return { error: "invalid" };
  }
  // Honeypot is inspected in control 5; cap length so it cannot be abused.
  if (honeypot.length > 200) return { error: "invalid" };

  return { value: { name, email, role, message, token, honeypot } };
}

// NOTE ON THE LOG CONTRACT: the four DynamoDB catch sites log
// `status: "ddb_error"` and add the SDK exception class as a SEPARATE `err`
// field. Do NOT collapse them into `status: err?.name` — the CloudWatch metric
// filter behind the fail-closed alarm matches {$.status="ddb_error"}, so
// overwriting status would silently stop the alarm firing for every real
// DynamoDB fault (throttle, deleted table, IAM denial). err.name is an
// exception class name, so the no-PII-in-logs invariant still holds.

// ---- DynamoDB-backed controls ----------------------------------------------
// Atomic counter in a TIME-BUCKETED fixed window: the window index is part of
// the partition key, so each window is a distinct item that starts at cnt=1.
//
// WHY THE KEY CARRIES THE WINDOW (this was a real outage bug, fixed 2026-08-20):
// the previous version used a bare pk and relied on DynamoDB TTL to end the
// window. TTL deletion is BEST-EFFORT — AWS documents it as "typically within
// 48 hours" of expiry, not at the expiry instant — and nothing here ever
// compared now against expires_at. So once a bucket tripped its limit, `cnt`
// stayed above the limit until the reaper happened to run. For the shared
// GLOBAL#siteverify bucket that meant 61 cheap unauthenticated requests
// (control 8 runs BEFORE siteverify, so no valid token is needed) could 429 the
// contact form for EVERY visitor for up to ~48 hours — and because retryAfter
// was derived from a past expires_at it collapsed to 1, so clients retry-looped.
//
// With the window in the key, a new window is simply a new item: counters can
// never leak across windows and reaper lag is harmless because expires_at is
// now pure garbage collection. TTL_GRACE_S keeps the reaper from removing a
// bucket while its window is still live (clock skew + reaper jitter).
// Floor to the window boundary so every caller in the same window shares one
// item, and the next window is a different item entirely. Exported for tests so
// the window math has exactly one definition (no hand-mirrored copy in the
// suite that could drift from the handler).
export function __windowKey(pk, windowS, atS = nowS()) {
  const windowStart = Math.floor(atS / windowS) * windowS;
  return { key: `${pk}#${windowStart}`, windowStart, windowEnd: windowStart + windowS };
}

async function bumpCounter(table, pk, windowS) {
  const { key, windowEnd } = __windowKey(pk, windowS);
  const res = await ddb("UpdateItem", {
    TableName: table,
    Key: { pk: { S: key } },
    UpdateExpression:
      "SET expires_at = if_not_exists(expires_at, :exp) ADD cnt :one",
    ExpressionAttributeValues: {
      ":one": { N: "1" },
      ":exp": { N: String(windowEnd + TTL_GRACE_S) },
    },
    ReturnValues: "UPDATED_NEW",
  });
  // expiresAt is the COMPUTED window end, never the stored attribute: it is
  // always in the future, so retryAfter is a real wait rather than a 1s loop.
  return {
    count: Number(res?.Attributes?.cnt?.N ?? "0"),
    expiresAt: windowEnd,
  };
}

// Best-effort removal of a claim made by putIfAbsent. Used to roll back the
// duplicate-suppression marker when delivery fails, so the sender's retry is
// not silently swallowed. Never throws: a failed rollback must not turn a
// delivery error into a 500.
async function deleteItemQuiet(table, pk) {
  try {
    await ddb("DeleteItem", {
      TableName: table,
      Key: { pk: { S: pk } },
    });
    return true;
  } catch {
    return false;
  }
}

// Conditional insert; resolves true if newly written, false if it already
// existed (replay / duplicate).
async function putIfAbsent(table, pk, ttlS) {
  try {
    await ddb("PutItem", {
      TableName: table,
      Item: { pk: { S: pk }, expires_at: { N: String(nowS() + ttlS) } },
      ConditionExpression: "attribute_not_exists(pk)",
    });
    return true;
  } catch (err) {
    if (isConditionalFail(err)) return false;
    throw err;
  }
}

function nowS() {
  return Math.floor(Date.now() / 1000);
}

// ---- control 6: Turnstile siteverify ----------------------------------------
async function siteverify(secret, token, trueIp) {
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (trueIp && trueIp !== "unknown") form.set("remoteip", trueIp);
  form.set("idempotency_key", randomUUID());
  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  try {
    return await res.json();
  } catch {
    return { success: false };
  }
}

function log(fields) {
  // control-outcome + trueIp + request id only; never body or secrets.
  console.log(JSON.stringify(fields));
}

// ============================================================================
export const handler = async (event) => {
  const cfg = env();
  const reqId =
    event?.requestContext?.requestId ??
    event?.headers?.["x-amzn-trace-id"] ??
    randomUUID();
  const headers = event?.headers ?? {};
  const method = event?.requestContext?.http?.method ?? "";
  const origin = headers.origin ?? headers.Origin ?? "";
  const trueIp = parseViewerAddress(
    headers["cloudfront-viewer-address"] ?? headers["CloudFront-Viewer-Address"],
  );
  const originAllowed = cfg.allowedOrigins.includes(origin);
  const outcome = (control, status) => {
    log({ reqId, trueIp, control, status });
    return status;
  };

  // --- Control 1: method gate (+ OPTIONS preflight handled with control 2) ---
  if (method === "OPTIONS") {
    if (!originAllowed) return outcome("cors_preflight", 403), respond(403, { ok: false });
    outcome("cors_preflight", 204);
    return { statusCode: 204, headers: corsHeaders(origin) };
  }
  if (method !== "POST") {
    outcome("method", 405);
    return respond(405, { ok: false, error: "method" });
  }

  // --- Control 2: strict CORS allowlist (never echo "*") ---------------------
  if (!originAllowed) {
    outcome("cors", 403);
    return respond(403, { ok: false, error: "forbidden" }); // no ACAO header
  }

  // --- Control 3: max body size ----------------------------------------------
  const declaredLen = Number(
    headers["content-length"] ?? headers["Content-Length"] ?? "0",
  );
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    outcome("body_size", 413);
    return respond(413, { ok: false, error: "too_large" }, origin);
  }
  const raw = event?.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : event?.body ?? "";
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    outcome("body_size", 413);
    return respond(413, { ok: false, error: "too_large" }, origin);
  }

  // --- Control 4: JSON parse + schema validation -----------------------------
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    outcome("json_parse", 400);
    return respond(400, { ok: false, error: "invalid" }, origin);
  }
  const { value: input, error } = validate(payload);
  if (error) {
    outcome("schema", 400);
    return respond(400, { ok: false, error: "invalid" }, origin);
  }

  // --- Control 5: honeypot (silent success; no mail, no rate-count) ----------
  if (input.honeypot && input.honeypot.trim() !== "") {
    outcome("honeypot", 200);
    return respond(200, { ok: true }, origin);
  }

  // --- Control 8 (moved early) + burst backstop: throttle BEFORE siteverify --
  // siteverify is an outbound HTTP round-trip that holds a Lambda slot; with
  // this account's low concurrency, an unauthenticated flood of valid-shaped
  // bodies + garbage tokens could otherwise saturate all slots (starving the
  // shared webhook Lambda) before any rate check ran. Gate on cheap atomic DDB
  // counters first: a global burst cap (bounds total siteverify calls even
  // under IP rotation) and the per-IP limit (IPv6 bucketed to /64). A real WAF
  // rate rule on /api/* is the recommended additional layer (see README).
  // ORDER: per-IP gate FIRST, then the shared global counter.
  //
  // The global counter used to be bumped first, which defeated its own stated
  // purpose: a single abusive IP being rejected by its own limit still consumed
  // the ALL-IP budget, so one throttled client could push GLOBAL#siteverify past
  // 60 and 429 the form for every legitimate visitor for the rest of the window.
  // With the IP gate first, only requests that could actually reach siteverify
  // consume the global budget — which is what the counter is for.
  const ipKey = ipRateKey(trueIp);
  try {
    const { count: ipCount, expiresAt: ipExpiresAt } = await bumpCounter(
      cfg.DDB_TABLE,
      `IP#${ipKey}`,
      IP_WINDOW_S,
    );
    if (ipCount > IP_MAX) {
      outcome("ip_rate", 429);
      // retryAfter is how long until the tripped bucket's window expires.
      const retryAfter = Math.max(1, ipExpiresAt - nowS());
      return respond(
        429,
        { ok: false, error: "rate_limited", retryAfter },
        origin,
        { "retry-after": String(retryAfter) },
      );
    }
    const { count, expiresAt } = await bumpCounter(
      cfg.DDB_TABLE,
      "GLOBAL#siteverify",
      GLOBAL_WINDOW_S,
    );
    if (count > GLOBAL_MAX) {
      outcome("global_burst", 429);
      // retryAfter is how long until the tripped bucket's window expires.
      const retryAfter = Math.max(1, expiresAt - nowS());
      return respond(
        429,
        { ok: false, error: "rate_limited", retryAfter },
        origin,
        { "retry-after": String(retryAfter) },
      );
    }
  } catch (err) {
    log({ reqId, trueIp, control: "pre_rate", status: "ddb_error", err: err?.name });
    return respond(502, { ok: false, error: "delivery" }, origin);
  }

  // --- Control 6: Turnstile siteverify ---------------------------------------
  let secret;
  try {
    secret = await getParam(cfg.TURNSTILE_SECRET_PARAM);
  } catch {
    outcome("siteverify_secret", 502);
    return respond(502, { ok: false, error: "delivery" }, origin);
  }
  const verify = await siteverify(secret, input.token, trueIp);
  if (
    verify?.success !== true ||
    !cfg.allowedHostnames.includes(verify?.hostname) ||
    verify?.action !== cfg.action
  ) {
    outcome("siteverify", 403);
    return respond(403, { ok: false, error: "verification" }, origin);
  }

  // --- Control 7: token freshness + min form time + replay guard -------------
  // All three failure modes share error:"verification" so bots cannot tell
  // which sub-check tripped.
  const ts = Date.parse(verify.challenge_ts ?? "");
  if (!Number.isFinite(ts)) {
    outcome("token_freshness", 403);
    return respond(403, { ok: false, error: "verification" }, origin);
  }
  const ageS = (Date.now() - ts) / 1000;
  if (ageS > TOKEN_MAX_AGE_S || ageS < MIN_FORM_TIME_S) {
    outcome(ageS < MIN_FORM_TIME_S ? "token_too_fast" : "token_stale", 403);
    return respond(403, { ok: false, error: "verification" }, origin);
  }
  const tokPk = `TOK#${sha256(input.token)}`;
  let firstUse;
  try {
    firstUse = await putIfAbsent(cfg.DDB_TABLE, tokPk, TOKEN_TTL_S);
  } catch (err) {
    log({ reqId, trueIp, control: "token_replay", status: "ddb_error", err: err?.name });
    return respond(502, { ok: false, error: "delivery" }, origin);
  }
  if (!firstUse) {
    outcome("token_reuse", 403);
    return respond(403, { ok: false, error: "verification" }, origin);
  }

  // --- Control 9: per-email rate limit ---------------------------------------
  const emailLower = input.email.toLowerCase();
  try {
    const { count: emailCount, expiresAt: emailExpiresAt } = await bumpCounter(
      cfg.DDB_TABLE,
      `EMAIL#${emailLower}`,
      EMAIL_WINDOW_S,
    );
    if (emailCount > EMAIL_MAX) {
      outcome("email_rate", 429);
      // retryAfter is how long until the tripped bucket's window expires.
      const retryAfter = Math.max(1, emailExpiresAt - nowS());
      return respond(
        429,
        { ok: false, error: "rate_limited", retryAfter },
        origin,
        { "retry-after": String(retryAfter) },
      );
    }
  } catch (err) {
    log({ reqId, trueIp, control: "email_rate", status: "ddb_error", err: err?.name });
    return respond(502, { ok: false, error: "delivery" }, origin);
  }

  // --- Control 10: duplicate suppression (silent success) --------------------
  const normalizedMsg = input.message.replace(/\s+/g, " ").toLowerCase();
  const dupPk = `DUP#${sha256(`${emailLower}|${normalizedMsg}`)}`;
  let dupFirst;
  try {
    dupFirst = await putIfAbsent(cfg.DDB_TABLE, dupPk, DUP_TTL_S);
  } catch (err) {
    log({ reqId, trueIp, control: "duplicate", status: "ddb_error", err: err?.name });
    return respond(502, { ok: false, error: "delivery" }, origin);
  }
  if (!dupFirst) {
    outcome("duplicate", 200); // already received; treat as success
    return respond(200, { ok: true }, origin);
  }

  // --- All controls passed: send the owner notification via SESv2 -----------
  // Reply-To is the SUBMITTER, so hitting reply in the mail client answers the
  // person who wrote in. The previous Apps Script sent as the owner's own
  // address, which meant Gmail filed the notification under Sent and
  // suppressed the inbox copy entirely — submissions were invisible.
  // From is a dedicated no-reply identity, so the notification is genuinely
  // inbound mail and lands in the inbox normally.
  const subject = `Coaching inquiry from ${input.name}`;
  const body = [
    "New coaching inquiry received:",
    "",
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Role: ${input.role || "Not specified"}`,
    "",
    "Message:",
    input.message,
    "",
    "---",
    `Sent by the ${cfg.MAIL_FROM_NAME}. Reply to this mail to answer ${input.email}.`,
  ].join("\n");

  try {
    await sesSend({
      FromEmailAddress: `${cfg.MAIL_FROM_NAME} <${cfg.MAIL_FROM}>`,
      Destination: { ToAddresses: [cfg.MAIL_TO] },
      ReplyToAddresses: [input.email],
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Text: { Data: body, Charset: "UTF-8" } },
        },
      },
    });
  } catch (err) {
    // Most likely causes, in order: identity not yet verified, the
    // ses:FromAddress condition not matching MAIL_FROM, or the sandbox
    // rejecting a recipient outside a verified domain. err.name distinguishes
    // them in CloudWatch without logging any submission content.
    log({ reqId, trueIp, control: "ses_send", status: err?.name ?? "error" });
    // RELEASE THE DUPLICATE CLAIM. The dedupe marker was committed before the
    // send (deliberately — it is what stops two concurrent identical
    // submissions from both mailing). If we leave it behind after a delivery
    // failure, the sender's retry hits control 10, gets `ok: true`, and the
    // message is silently never delivered for the whole DUP_TTL_S window.
    // Claim -> send -> release-on-failure keeps the race protection and keeps
    // a retry honest.
    const released = await deleteItemQuiet(cfg.DDB_TABLE, dupPk);
    if (!released) {
      log({ reqId, trueIp, control: "duplicate", status: "release_failed" });
    }
    outcome("ses_send", 502);
    return respond(502, { ok: false, error: "delivery" }, origin);
  }

  outcome("delivered", 200);
  return respond(200, { ok: true }, origin);
};

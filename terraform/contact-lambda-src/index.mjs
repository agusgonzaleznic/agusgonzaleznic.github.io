// Contact form gateway Lambda (Function URL, payload v2.0).
// Runs 10 anti-abuse controls IN ORDER (cheapest-first / fail-fast), then
// forwards the sanitized message to a Google Apps Script that emails the owner.
// ZERO npm deps: node:crypto, global fetch, @aws-sdk/client-{ssm,dynamodb}
// (both bundled in the nodejs22.x runtime, imported dynamically).
//
// Env contract (set by infra / terraform):
//   TURNSTILE_SECRET_PARAM   SSM SecureString name holding the Turnstile secret
//   APPS_SCRIPT_URL_PARAM     SSM SecureString name holding the Apps Script URL
//   APPS_SCRIPT_SECRET_PARAM  SSM SecureString name holding the server-only
//                             shared secret injected into the forward payload
//   DDB_TABLE                 DynamoDB table name (pk: S, ttl attr: expires_at)
//   ALLOWED_ORIGINS         comma-separated exact Origins (CORS allowlist)
//   ALLOWED_HOSTNAMES       comma-separated Turnstile hostnames to accept
//   TURNSTILE_ACTION        expected Turnstile action (e.g. "contact")
//
// Reserved concurrency: DO NOT set (account limit is low). See webhook.tf note.

import { createHash, randomUUID } from "node:crypto";

// ---- tuning constants (see the 10 controls below) ---------------------------
const MAX_BODY_BYTES = 8192; // control 3
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

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// C0 control chars + DEL; strict variant allows \t \n \r (multiline message).
const CTRL_ANY = /[\x00-\x1F\x7F]/;
const CTRL_MULTILINE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function env() {
  return {
    TURNSTILE_SECRET_PARAM: process.env.TURNSTILE_SECRET_PARAM,
    APPS_SCRIPT_URL_PARAM: process.env.APPS_SCRIPT_URL_PARAM,
    APPS_SCRIPT_SECRET_PARAM: process.env.APPS_SCRIPT_SECRET_PARAM,
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
let _ddbClient = null;
let _ssmClient = null;

export function __setTestDeps({ ddbSend, getParam } = {}) {
  if (ddbSend !== undefined) _ddbSend = ddbSend;
  if (getParam !== undefined) _getParamOverride = getParam;
}
export function __resetTestDeps() {
  _ddbSend = null;
  _getParamOverride = null;
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

function respond(statusCode, body, origin) {
  const headers = { "content-type": "application/json" };
  if (origin) Object.assign(headers, corsHeaders(origin));
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

// ---- DynamoDB-backed controls ----------------------------------------------
// Atomic counter within a fixed window: TTL is anchored at first hit via
// if_not_exists, so the whole bucket expires window seconds later.
async function bumpCounter(table, pk, windowS) {
  const res = await ddb("UpdateItem", {
    TableName: table,
    Key: { pk: { S: pk } },
    UpdateExpression:
      "SET expires_at = if_not_exists(expires_at, :exp) ADD cnt :one",
    ExpressionAttributeValues: {
      ":one": { N: "1" },
      ":exp": { N: String(nowS() + windowS) },
    },
    ReturnValues: "UPDATED_NEW",
  });
  return Number(res?.Attributes?.cnt?.N ?? "0");
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
  const ipKey = ipRateKey(trueIp);
  try {
    const burst = await bumpCounter(
      cfg.DDB_TABLE,
      "GLOBAL#siteverify",
      GLOBAL_WINDOW_S,
    );
    if (burst > GLOBAL_MAX) {
      outcome("global_burst", 429);
      return respond(429, { ok: false, error: "rate_limited" }, origin);
    }
    const ipCount = await bumpCounter(cfg.DDB_TABLE, `IP#${ipKey}`, IP_WINDOW_S);
    if (ipCount > IP_MAX) {
      outcome("ip_rate", 429);
      return respond(429, { ok: false, error: "rate_limited" }, origin);
    }
  } catch (err) {
    log({ reqId, trueIp, control: "pre_rate", status: "ddb_error" });
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
    log({ reqId, trueIp, control: "token_replay", status: "ddb_error" });
    return respond(502, { ok: false, error: "delivery" }, origin);
  }
  if (!firstUse) {
    outcome("token_reuse", 403);
    return respond(403, { ok: false, error: "verification" }, origin);
  }

  // --- Control 9: per-email rate limit ---------------------------------------
  const emailLower = input.email.toLowerCase();
  try {
    const emailCount = await bumpCounter(
      cfg.DDB_TABLE,
      `EMAIL#${emailLower}`,
      EMAIL_WINDOW_S,
    );
    if (emailCount > EMAIL_MAX) {
      outcome("email_rate", 429);
      return respond(429, { ok: false, error: "rate_limited" }, origin);
    }
  } catch (err) {
    log({ reqId, trueIp, control: "email_rate", status: "ddb_error" });
    return respond(502, { ok: false, error: "delivery" }, origin);
  }

  // --- Control 10: duplicate suppression (silent success) --------------------
  const normalizedMsg = input.message.replace(/\s+/g, " ").toLowerCase();
  const dupPk = `DUP#${sha256(`${emailLower}|${normalizedMsg}`)}`;
  let dupFirst;
  try {
    dupFirst = await putIfAbsent(cfg.DDB_TABLE, dupPk, DUP_TTL_S);
  } catch (err) {
    log({ reqId, trueIp, control: "duplicate", status: "ddb_error" });
    return respond(502, { ok: false, error: "delivery" }, origin);
  }
  if (!dupFirst) {
    outcome("duplicate", 200); // already received; treat as success
    return respond(200, { ok: true }, origin);
  }

  // --- All controls passed: forward to Apps Script ---------------------------
  // The Apps Script /exec URL was historically inlined into the public client
  // bundle, so the URL alone cannot gate access. The forward carries a
  // server-only shared secret that ONLY this Lambda knows; doPost() MUST reject
  // any POST whose `secret` does not match (see README runbook). It is a body
  // FIELD, not a header, because Apps Script's doPost cannot read arbitrary
  // request headers. Both URL and secret live in SSM, never in the bundle.
  let scriptUrl, forwardSecret;
  try {
    scriptUrl = await getParam(cfg.APPS_SCRIPT_URL_PARAM);
    forwardSecret = await getParam(cfg.APPS_SCRIPT_SECRET_PARAM);
  } catch {
    outcome("forward_secret", 502);
    return respond(502, { ok: false, error: "delivery" }, origin);
  }
  let fwd;
  try {
    fwd = await fetch(scriptUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        role: input.role,
        message: input.message,
        secret: forwardSecret,
      }),
    });
  } catch {
    outcome("forward", 502);
    return respond(502, { ok: false, error: "delivery" }, origin);
  }
  if (!fwd.ok) {
    outcome("forward", 502);
    return respond(502, { ok: false, error: "delivery" }, origin);
  }

  outcome("delivered", 200);
  return respond(200, { ok: true }, origin);
};

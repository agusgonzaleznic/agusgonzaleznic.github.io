// Unit tests for the contact Lambda: exercises every control's pass AND fail
// path. DynamoDB, SSM, SES, and fetch are stubbed (no network, no AWS).
//   node --test
import { test } from "node:test";  // timers come from the per-test context (t.mock)
import assert from "node:assert/strict";
import {
  handler,
  __setTestDeps,
  __resetTestDeps,
  __windowKey,
  __limits,
  __commandNameFor,
  __DDB_COMMANDS,
} from "./index.mjs";

process.env.TURNSTILE_SECRET_PARAM = "/p/turnstile-secret";
process.env.MAIL_FROM = "noreply@agusgonzaleznic.com";
process.env.MAIL_FROM_NAME = "agusgonzaleznic.com contact form";
process.env.MAIL_TO = "me@agusgonzaleznic.com";
process.env.DDB_TABLE = "agusgonzaleznic-contact";
process.env.ALLOWED_ORIGINS =
  "https://agusgonzaleznic.com,https://www.agusgonzaleznic.com";
process.env.ALLOWED_HOSTNAMES = "agusgonzaleznic.com,www.agusgonzaleznic.com";
process.env.TURNSTILE_ACTION = "contact";

const ORIGIN = "https://agusgonzaleznic.com";

function tsAgo(seconds) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

// In-memory DynamoDB stub. put respects attribute_not_exists(pk); update is an
// atomic counter. Tests can pre-seed `counts` / `puts` to force conditions.
// Rate-limit buckets are keyed by window (see bumpCounter). Derive the key via
// the handler's own exported helper so these tests cannot drift from the
// implementation the way a hand-copied `IP#<ip>` literal did.
function ipKey(ip) {
  return __windowKey(`IP#${ip}`, __limits.IP_WINDOW_S).key;
}

// Freeze the clock mid-window.
//
// retryAfter is `windowEnd - now`, so any assertion that it is a REAL wait is
// non-deterministic against a live clock: run inside the last second of a 600s
// window and retryAfter legitimately equals 1, which is correct behaviour but
// indistinguishable from the bug the assertion exists to catch (the old code
// derived it from a PAST expires_at so it always collapsed to 1). That is a
// 1-in-600 flake per assertion — it fired in CI, failing three tests at once
// because they shared the same boundary second.
//
// Pinning `now` to a known offset inside the window makes retryAfter exact, so
// the test stays discriminating instead of being loosened to `>= 1`.
const WINDOW_OFFSET_S = 100; // seconds into the window; retryAfter must be window - this
function freezeClockMidWindow(t, windowS) {
  const start = 1_700_000_000 - (1_700_000_000 % windowS);
  t.mock.timers.enable({ apis: ["Date"], now: (start + WINDOW_OFFSET_S) * 1000 });
  return windowS - WINDOW_OFFSET_S;
}

function makeDdb() {
  const puts = new Set();
  const counts = new Map();
  const expiries = new Map();
  const calls = [];
  const send = async (op, params) => {
    calls.push({ op, params });
    if (op === "PutItem") {
      const pk = params.Item.pk.S;
      if (puts.has(pk)) {
        const e = new Error("exists");
        e.name = "ConditionalCheckFailedException";
        throw e;
      }
      puts.add(pk);
      return {};
    }
    if (op === "DeleteItem") {
      puts.delete(params.Key.pk.S);
      return {};
    }
    if (op === "UpdateItem") {
      const pk = params.Key.pk.S;
      const next = (counts.get(pk) ?? 0) + 1;
      counts.set(pk, next);
      // Mirror real DynamoDB ReturnValues:"UPDATED_NEW": the SET clause writes
      // expires_at via if_not_exists, so it's anchored on the first hit and
      // echoed back on every bump. The handler derives retryAfter from it, so
      // the stub MUST return it — otherwise retryAfter silently collapses to 1
      // and the derivation goes untested.
      if (!expiries.has(pk)) {
        expiries.set(pk, params.ExpressionAttributeValues?.[":exp"]?.N ?? "0");
      }
      return {
        Attributes: { cnt: { N: String(next) }, expires_at: { N: expiries.get(pk) } },
      };
    }
    throw new Error(`unexpected op ${op}`);
  };
  return { send, puts, counts, expiries, calls };
}

// Configurable fetch stub. Siteverify is now the ONLY outbound fetch: the owner
// notification goes through the SES stub below, not the network.
function makeFetch({ verify, verifyStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    if (String(url).includes("siteverify")) {
      return {
        ok: verifyStatus >= 200 && verifyStatus < 300,
        status: verifyStatus,
        json: async () => verify,
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fn, calls };
}

// SESv2 stub. `sendFails` simulates an AWS-side rejection (unverified identity,
// ses:FromAddress mismatch, sandbox recipient) so the 502 path stays covered.
function makeSes({ sendFails = false } = {}) {
  const calls = [];
  const send = async (params) => {
    calls.push(params);
    if (sendFails) {
      const err = new Error("MessageRejected");
      err.name = "MessageRejected";
      throw err;
    }
    return { MessageId: `stub-${calls.length}` };
  };
  return { send, calls };
}

function install({ ddb, verify, verifyStatus, sendFails } = {}) {
  const d = ddb ?? makeDdb();
  const ses = makeSes({ sendFails });
  const goodVerify = {
    success: true,
    hostname: "agusgonzaleznic.com",
    action: "contact",
    challenge_ts: tsAgo(30),
  };
  const f = makeFetch({
    verify: verify ?? goodVerify,
    verifyStatus,
  });
  __resetTestDeps();
  __setTestDeps({
    ddbSend: d.send,
    sesSend: ses.send,
    getParam: async (name) => {
      if (name === process.env.TURNSTILE_SECRET_PARAM) return "SECRET";
      return "UNEXPECTED-PARAM";
    },
  });
  globalThis.fetch = f.fn;
  return { ddb: d, fetch: f, ses };
}

let tokenSeq = 0;
function body(overrides = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "CTO",
    message: "Hello there, this is a genuine message about a real problem.",
    turnstileToken: `tok-${tokenSeq++}-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

function event({
  method = "POST",
  origin = ORIGIN,
  ip = "203.0.113.5:443",
  bodyObj,
  rawBody,
  contentLength,
  isBase64Encoded = false,
} = {}) {
  const b = rawBody !== undefined ? rawBody : JSON.stringify(bodyObj ?? body());
  const headers = {};
  if (origin !== null) headers.origin = origin;
  if (ip !== null) headers["cloudfront-viewer-address"] = ip;
  headers["content-length"] = String(
    contentLength ?? Buffer.byteLength(b, "utf8"),
  );
  return {
    requestContext: { requestId: "req-1", http: { method } },
    headers,
    body: b,
    isBase64Encoded,
  };
}

function parse(res) {
  return res.body ? JSON.parse(res.body) : undefined;
}

// --- Control 1: method gate --------------------------------------------------
test("OPTIONS preflight from allowed origin -> 204 with CORS", async () => {
  install();
  const res = await handler(event({ method: "OPTIONS" }));
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["access-control-allow-origin"], ORIGIN);
});

test("OPTIONS preflight from bad origin -> 403", async () => {
  install();
  const res = await handler(event({ method: "OPTIONS", origin: "https://evil.com" }));
  assert.equal(res.statusCode, 403);
});

test("OPTIONS allow-headers covers every header the client actually sends", async () => {
  install();
  const res = await handler(event({ method: "OPTIONS" }));
  // The production form is same-origin (no preflight); the client sends only
  // Content-Type. x-amz-content-sha256 is CloudFront's own OAC-signing header,
  // never sent by the browser, so it must NOT be required here.
  const allowed = res.headers["access-control-allow-headers"]
    .split(",")
    .map((h) => h.trim().toLowerCase());
  for (const h of ["content-type"]) {
    assert.ok(allowed.includes(h), `preflight must allow ${h}`);
  }
});

test("GET -> 405", async () => {
  install();
  const res = await handler(event({ method: "GET" }));
  assert.equal(res.statusCode, 405);
});

// --- Control 2: CORS allowlist -----------------------------------------------
test("POST from disallowed origin -> 403, no ACAO", async () => {
  install();
  const res = await handler(event({ origin: "https://evil.com" }));
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

test("www origin is allowed", async () => {
  install();
  const res = await handler(
    event({ origin: "https://www.agusgonzaleznic.com" }),
  );
  assert.equal(res.statusCode, 200);
  assert.equal(
    res.headers["access-control-allow-origin"],
    "https://www.agusgonzaleznic.com",
  );
});

// --- Control 3: body size ----------------------------------------------------
// Sizes derive from the implementation's own limit rather than a magic number:
// these two tests hardcoded 9000, which silently stopped testing anything the
// moment MAX_BODY_BYTES was raised above it.
test("oversized Content-Length -> 413", async () => {
  install();
  const res = await handler(event({ contentLength: __limits.MAX_BODY_BYTES + 1 }));
  assert.equal(res.statusCode, 413);
});

test("oversized actual body (spoofed small Content-Length) -> 413", async () => {
  install();
  const big = JSON.stringify(body({ message: "x".repeat(__limits.MAX_BODY_BYTES + 100) }));
  const res = await handler(event({ rawBody: big, contentLength: 10 }));
  assert.equal(res.statusCode, 413);
});

test("a 4,000-character message in a 3-byte script fits under the body cap", async () => {
  // The point of raising MAX_BODY_BYTES: the ADVERTISED 4,000-char limit has to
  // be deliverable in every script, not just ASCII. At 8192 this 413'd.
  install();
  const cjk = "\u65e5".repeat(4000); // 4,000 chars x 3 bytes = 12,000 bytes
  const payload = JSON.stringify(body({ message: cjk }));
  assert.ok(
    Buffer.byteLength(payload, "utf8") > 8192,
    "fixture must exceed the OLD cap, or it proves nothing",
  );
  const res = await handler(event({ rawBody: payload }));
  assert.notEqual(res.statusCode, 413, "a legitimate CJK message must not be rejected as oversized");
  assert.equal(res.statusCode, 200);
});

// --- Control 4: schema -------------------------------------------------------
test("invalid JSON -> 400", async () => {
  install();
  const res = await handler(event({ rawBody: "{not json" }));
  assert.equal(res.statusCode, 400);
});

test("unknown key -> 400", async () => {
  install();
  const res = await handler(event({ bodyObj: body({ extra: "x" }) }));
  assert.equal(res.statusCode, 400);
});

test("missing required field -> 400", async () => {
  install();
  const b = body();
  delete b.email;
  const res = await handler(event({ bodyObj: b }));
  assert.equal(res.statusCode, 400);
});

test("bad email -> 400", async () => {
  install();
  const res = await handler(event({ bodyObj: body({ email: "nope" }) }));
  assert.equal(res.statusCode, 400);
});

test("message too short -> 400", async () => {
  install();
  const res = await handler(event({ bodyObj: body({ message: "short" }) }));
  assert.equal(res.statusCode, 400);
});

test("control char in name -> 400", async () => {
  install();
  const res = await handler(event({ bodyObj: body({ name: "Ada" }) }));
  assert.equal(res.statusCode, 400);
});

test("multiline message is accepted", async () => {
  install();
  const res = await handler(
    event({ bodyObj: body({ message: "line one\nline two, this is long enough." }) }),
  );
  assert.equal(res.statusCode, 200);
});

// --- Control 5: honeypot -----------------------------------------------------
test("honeypot filled -> silent 200, no mail, no ddb writes", async () => {
  const { ddb, fetch } = install();
  const res = await handler(
    event({ bodyObj: body({ company_website: "http://spam" }) }),
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(parse(res), { ok: true });
  assert.equal(fetch.calls.length, 0); // no siteverify, no forward
  assert.equal(ddb.calls.length, 0); // no rate-count
});

test("empty honeypot passes through", async () => {
  const res = await (async () => {
    install();
    return handler(event({ bodyObj: body({ company_website: "" }) }));
  })();
  assert.equal(res.statusCode, 200);
});

// --- Control 6: siteverify ---------------------------------------------------
test("siteverify success=false -> 403 verification", async () => {
  install({ verify: { success: false } });
  const res = await handler(event());
  assert.equal(res.statusCode, 403);
  assert.deepEqual(parse(res), { ok: false, error: "verification" });
});

test("siteverify wrong hostname -> 403", async () => {
  install({
    verify: {
      success: true,
      hostname: "evil.com",
      action: "contact",
      challenge_ts: tsAgo(30),
    },
  });
  const res = await handler(event());
  assert.equal(res.statusCode, 403);
});

test("siteverify wrong action -> 403", async () => {
  install({
    verify: {
      success: true,
      hostname: "agusgonzaleznic.com",
      action: "signup",
      challenge_ts: tsAgo(30),
    },
  });
  const res = await handler(event());
  assert.equal(res.statusCode, 403);
});

// --- Control 7: freshness / too-fast / reuse ---------------------------------
test("stale token (age > 300s) -> 403", async () => {
  install({
    verify: {
      success: true,
      hostname: "agusgonzaleznic.com",
      action: "contact",
      challenge_ts: tsAgo(600),
    },
  });
  const res = await handler(event());
  assert.equal(res.statusCode, 403);
  assert.deepEqual(parse(res), { ok: false, error: "verification" });
});

test("too-fast submission (age < 3s) -> 403", async () => {
  install({
    verify: {
      success: true,
      hostname: "agusgonzaleznic.com",
      action: "contact",
      challenge_ts: tsAgo(1),
    },
  });
  const res = await handler(event());
  assert.equal(res.statusCode, 403);
});

test("reused token (TOK# already present) -> 403", async () => {
  install();
  const b = body();
  // First submission succeeds and records the token.
  const r1 = await handler(event({ bodyObj: b }));
  assert.equal(r1.statusCode, 200);
  // Replay the exact same token: siteverify still "succeeds" (idempotency) but
  // the replay guard rejects it.
  const r2 = await handler(event({ bodyObj: b }));
  assert.equal(r2.statusCode, 403);
  assert.deepEqual(parse(r2), { ok: false, error: "verification" });
});

// --- Control 8: per-IP rate limit --------------------------------------------
test("per-IP over limit -> 429", async (t) => {
  const expected = freezeClockMidWindow(t, __limits.IP_WINDOW_S);
  const { ddb } = install();
  ddb.counts.set(ipKey("203.0.113.5"), 5); // next bump -> 6 > 5
  const res = await handler(event());
  assert.equal(res.statusCode, 429);
  const b = parse(res);
  assert.equal(b.ok, false);
  assert.equal(b.error, "rate_limited");
  // retryAfter (seconds to wait) is derived from the tripped bucket's
  // expires_at (= first hit + IP window). Assert it reflects the real window,
  // not the constant-1 fallback that a stub omitting expires_at would produce,
  // and that the Retry-After header mirrors it.
  // Exact, because the clock is pinned: retryAfter is the remaining window.
  assert.equal(b.retryAfter, expected);
  assert.equal(res.headers["retry-after"], String(b.retryAfter));
});

test("IPv6 callers in the same /64 share one per-IP bucket", async (t) => {
  const expected = freezeClockMidWindow(t, __limits.IP_WINDOW_S);
  const { ddb } = install();
  ddb.counts.set(ipKey("2001:db8:1:2::/64"), 5); // next bump -> 6 > 5
  // A different interface id inside the same /64 must map to the same bucket.
  const res = await handler(event({ ip: "2001:db8:1:2:aaaa:bbbb:cccc:dddd:443" }));
  assert.equal(res.statusCode, 429);
  const b = parse(res);
  assert.equal(b.ok, false);
  assert.equal(b.error, "rate_limited");
  // retryAfter (seconds to wait) is derived from the tripped bucket's
  // expires_at (= first hit + IP window). Assert it reflects the real window,
  // not the constant-1 fallback that a stub omitting expires_at would produce,
  // and that the Retry-After header mirrors it.
  assert.equal(b.retryAfter, expected);
  assert.equal(res.headers["retry-after"], String(b.retryAfter));
});

test("per-IP rate limit is enforced BEFORE the siteverify network call", async () => {
  const { ddb, fetch } = install();
  ddb.counts.set(ipKey("203.0.113.5"), 5); // next bump -> 6 > 5
  const res = await handler(event());
  assert.equal(res.statusCode, 429);
  // No outbound siteverify happened — the flood is bounded before that spend.
  assert.equal(fetch.calls.length, 0);
});

// --- Control 9: per-email rate limit -----------------------------------------
test("per-email over limit -> 429", async () => {
  const { ddb } = install();
  ddb.counts.set(
    __windowKey("EMAIL#ada@example.com", __limits.EMAIL_WINDOW_S).key,
    3,
  ); // next bump -> 4 > 3
  const res = await handler(event());
  assert.equal(res.statusCode, 429);
});

// --- Control 10: duplicate suppression ---------------------------------------
test("duplicate message -> silent 200, not emailed twice", async () => {
  const { ses } = install();
  const dupBody = body({ message: "This exact message repeats across sends." });
  // Pre-seed the DUP# row so the first request in THIS test is a duplicate.
  // Compute the same key the handler would (email lowercased + normalized msg).
  const r1 = await handler(event({ bodyObj: dupBody }));
  assert.equal(r1.statusCode, 200);
  const sendsAfterFirst = ses.calls.length;
  // Second send, same email+message, fresh token -> duplicate -> 200 silent.
  const r2 = await handler(
    event({ bodyObj: { ...dupBody, turnstileToken: `tok-fresh-${tokenSeq++}` } }),
  );
  assert.equal(r2.statusCode, 200);
  const sendsAfterSecond = ses.calls.length;
  assert.equal(sendsAfterFirst, 1);
  assert.equal(sendsAfterSecond, 1); // no additional email
});

// --- Send failure ------------------------------------------------------------
test("SES send rejected -> 502 delivery, no detail leaked to the browser", async () => {
  install({ sendFails: true });
  const res = await handler(event());
  assert.equal(res.statusCode, 502);
  assert.deepEqual(parse(res), { ok: false, error: "delivery" });
});

// --- Happy path --------------------------------------------------------------
test("happy path -> 200 ok, emails the owner with submitter as Reply-To", async () => {
  const { ses } = install();
  const res = await handler(event());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(parse(res), { ok: true });
  assert.equal(ses.calls.length, 1);
  const sent = ses.calls[0];

  // From must be the pinned identity: the ses:FromAddress condition on both the
  // role policy and the permissions boundary denies anything else at runtime.
  assert.match(sent.FromEmailAddress, /<noreply@agusgonzaleznic\.com>$/);
  assert.deepEqual(sent.Destination.ToAddresses, ["me@agusgonzaleznic.com"]);

  // The whole point of the SES migration: replying answers the SUBMITTER, and
  // the mail is genuinely inbound rather than self-sent (which Gmail used to
  // dedupe into Sent, hiding submissions entirely).
  assert.deepEqual(sent.ReplyToAddresses, ["ada@example.com"]);

  const text = sent.Content.Simple.Body.Text.Data;
  assert.match(sent.Content.Simple.Subject.Data, /^Coaching inquiry from /);
  assert.match(text, /ada@example\.com/);
  // Sanitized fields are carried through, and no secret is embedded any more.
  assert.doesNotMatch(text, /secret/i);
});

test("true IP is parsed from CloudFront-Viewer-Address (port stripped)", async () => {
  const { fetch } = install();
  await handler(event({ ip: "198.51.100.10:52345" }));
  const sv = fetch.calls.find((c) => String(c.url).includes("siteverify"));
  assert.match(sv.opts.body, /remoteip=198\.51\.100\.10(?!%3A)/);
});

// --- Regressions: rate-limit windows + dup-claim rollback (fixed 2026-08-20) --

test("rate-limit window ROLLS OVER: a tripped previous window does not 429 the next one", async () => {
  const ddb = makeDdb();
  install({ ddb });
  // Reproduce the state a past burst left behind under the OLD bare-key scheme:
  // an un-windowed bucket, way past its cap, whose expires_at is already in the
  // past. The old code kept counting into that same item until DynamoDB's TTL
  // reaper happened to run (AWS documents it as "typically within 48 hours"),
  // so ~61 cheap unauthenticated requests 429'd the contact form worldwide for
  // up to two days. Seeding the bare key makes this test fail against that code
  // and pass against the windowed key.
  ddb.counts.set("GLOBAL#siteverify", __limits.GLOBAL_MAX + 500);
  ddb.expiries.set(
    "GLOBAL#siteverify",
    String(Math.floor(Date.now() / 1000) - 3600),
  );
  // Also seed the previous window's bucket: a real rollover must ignore it too.
  const prev = __windowKey(
    "GLOBAL#siteverify",
    __limits.GLOBAL_WINDOW_S,
    Math.floor(Date.now() / 1000) - __limits.GLOBAL_WINDOW_S,
  );
  ddb.counts.set(prev.key, __limits.GLOBAL_MAX + 500);

  const res = await handler(event());
  assert.equal(res.statusCode, 200, "current window must start clean");
  assert.equal(parse(res).ok, true);
});

test("tripped window returns a real retryAfter (never the 1s retry-loop)", async (t) => {
  const expected = freezeClockMidWindow(t, __limits.GLOBAL_WINDOW_S);
  const ddb = makeDdb();
  install({ ddb });
  const cur = __windowKey("GLOBAL#siteverify", __limits.GLOBAL_WINDOW_S);
  ddb.counts.set(cur.key, __limits.GLOBAL_MAX); // next bump trips it

  const res = await handler(event());
  assert.equal(res.statusCode, 429);
  const { retryAfter } = parse(res);
  // Derived from the COMPUTED window end, so it is a genuine wait. The old code
  // derived it from a stored expires_at that was already in the past, so
  // Math.max(1, past - now) collapsed to 1 and clients hammered.
  // Exact rather than a range: the old code derived retryAfter from an
  // already-past expires_at, so it always collapsed to 1 and clients hammered.
  assert.equal(retryAfter, expected);
  assert.ok(retryAfter > 1, "a pinned mid-window clock must yield a real wait");
});

test("counters are scoped per window key, so buckets cannot leak across windows", () => {
  // Boundaries fall on multiples of the window, so [600,1200) is one bucket.
  const a = __windowKey("IP#203.0.113.5", 600, 1000);
  const b = __windowKey("IP#203.0.113.5", 600, 1199);
  const c = __windowKey("IP#203.0.113.5", 600, 1200);
  assert.equal(a.key, b.key, "same window -> same bucket");
  assert.notEqual(b.key, c.key, "next window -> different bucket");
  assert.equal(a.windowStart, 600);
  assert.equal(a.windowEnd, 1200);
  assert.equal(c.windowStart, 1200, "boundary instant starts the NEXT window");
});

test("SES failure RELEASES the duplicate claim, so the sender's retry is not swallowed", async () => {
  const ddb = makeDdb();
  const payload = body();

  // Attempt 1: delivery fails -> honest 502.
  install({ ddb, sendFails: true });
  const first = await handler(event({ bodyObj: payload }));
  assert.equal(first.statusCode, 502);
  assert.equal(parse(first).error, "delivery");

  const dupKeys = [...ddb.puts].filter((k) => k.startsWith("DUP#"));
  assert.equal(
    dupKeys.length,
    0,
    "the dup marker must be rolled back after a failed send",
  );

  // Attempt 2: same message, SES healthy. Must actually send — the old code
  // hit control 10, answered `ok: true`, and delivered nothing for DUP_TTL_S.
  const ses = makeSes();
  __setTestDeps({ ddbSend: ddb.send, sesSend: ses.send, getParam: async () => "SECRET" });
  const retry = await handler(
    event({ bodyObj: { ...payload, turnstileToken: `tok-retry-${Math.random()}` } }),
  );
  assert.equal(retry.statusCode, 200, "retry after a delivery failure must go through");
  assert.equal(parse(retry).ok, true);
  assert.equal(ses.calls.length, 1, "the retry must actually email the owner");
});

test("a genuine duplicate is still suppressed once delivery succeeded", async () => {
  const ddb = makeDdb();
  const payload = body();
  const { ses } = install({ ddb });

  const first = await handler(event({ bodyObj: payload }));
  assert.equal(first.statusCode, 200);
  assert.equal(ses.calls.length, 1);

  const again = await handler(
    event({ bodyObj: { ...payload, turnstileToken: `tok-dup-${Math.random()}` } }),
  );
  assert.equal(again.statusCode, 200, "duplicate is a silent success");
  assert.equal(ses.calls.length, 1, "but must NOT email twice");
});

// --- The alarm's log contract (fail-closed observability) --------------------
// The CloudWatch metric filter behind the fail-closed alarm matches
// {$.status="ddb_error"}. These tests pin that contract so a future refactor
// that folds the diagnostic into `status` cannot silently disable the alarm.

function captureLogs(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = orig;
    })
    .then((res) => ({ res, lines }));
}

test("a DynamoDB fault logs status=ddb_error AND the exception class in a separate err field", async () => {
  const ddb = makeDdb();
  const boom = new Error("throttled");
  boom.name = "ProvisionedThroughputExceededException";
  const failing = { ...ddb, send: async () => { throw boom; } };
  install({ ddb: failing });

  const { res, lines } = await captureLogs(() => handler(event()));

  // Fail CLOSED: a rate-limit backend that cannot be consulted must not admit.
  assert.equal(res.statusCode, 502);

  const entry = lines
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .find((o) => o && o.status === "ddb_error");
  assert.ok(entry, `expected a status="ddb_error" log line, got: ${lines.join(" | ")}`);
  assert.equal(
    entry.status,
    "ddb_error",
    "status must stay the literal alarm key — the metric filter matches {$.status=\"ddb_error\"}",
  );
  assert.equal(
    entry.err,
    "ProvisionedThroughputExceededException",
    "the SDK exception class must be carried in `err`, so throttling is distinguishable from an outage",
  );
  // no-PII invariant: the log must never carry submission content.
  const blob = JSON.stringify(entry);
  for (const secret of ["Ada Lovelace", "ada@example.com", "genuine message"]) {
    assert.ok(!blob.includes(secret), `log leaked ${secret}: ${blob}`);
  }
});

// --- Fail-CLOSED guarantees (controls 7, 8, 9, 10) ---------------------------
//
// Four catch blocks are the entire fail-closed guarantee: if the DynamoDB-backed
// rate limits, the replay guard or the duplicate check cannot be consulted, the
// handler must REJECT rather than admit unmetered traffic. None of them had a
// test, so a refactor could have flipped any of them to fail OPEN — turning
// every limit off — and the suite would still have been green.
//
// The thrower must be pk-SELECTIVE. A blanket `send: () => { throw }` only ever
// reaches the FIRST catch, because the pre-rate block 502s before token-replay,
// per-email or duplicate are called — so three of these four tests would pass
// for entirely the wrong reason.
function ddbFailingOn(prefix) {
  const real = makeDdb();
  const boom = new Error("ddb down");
  boom.name = "InternalServerError";
  return {
    ...real,
    send: async (op, params) => {
      const pk = params.Key?.pk?.S ?? params.Item?.pk?.S ?? "";
      if (pk.startsWith(prefix)) throw boom;
      return real.send(op, params);
    },
  };
}

for (const [prefix, control] of [
  ["IP#", "the per-IP rate limit"],
  ["GLOBAL#", "the global burst backstop"],
  ["TOK#", "the Turnstile replay guard"],
  ["EMAIL#", "the per-email rate limit"],
  ["DUP#", "duplicate suppression"],
]) {
  test(`${control} fails CLOSED when DynamoDB is unavailable`, async () => {
    install({ ddb: ddbFailingOn(prefix) });
    const res = await handler(event());
    assert.equal(
      res.statusCode,
      502,
      `${control} must reject when its backend is unreachable, not admit the request`,
    );
    assert.equal(parse(res).error, "delivery");
  });
}

test("a DynamoDB failure never reaches SES", async () => {
  const ses = makeSes();
  __resetTestDeps();
  __setTestDeps({
    ddbSend: ddbFailingOn("DUP#").send,
    sesSend: ses.send,
    getParam: async () => "SECRET",
  });
  globalThis.fetch = makeFetch({
    verify: { success: true, hostname: "agusgonzaleznic.com", action: "contact", challenge_ts: tsAgo(30) },
  }).fn;
  const res = await handler(event());
  assert.equal(res.statusCode, 502);
  assert.equal(ses.calls.length, 0, "must not email when the duplicate check could not run");
});

// --- Global burst backstop (control 8) --------------------------------------
// The only control with zero coverage. It exists so a flood using rotating IPs
// cannot saturate the account's low Lambda concurrency with outbound siteverify
// calls (starving the shared webhook Lambda).
test("global burst cap trips at GLOBAL_MAX and rejects BEFORE siteverify", async () => {
  const ddb = makeDdb();
  const { fetch: f } = install({ ddb });
  ddb.counts.set(
    __windowKey("GLOBAL#siteverify", __limits.GLOBAL_WINDOW_S).key,
    __limits.GLOBAL_MAX,
  );

  const res = await handler(event());
  assert.equal(res.statusCode, 429);
  assert.equal(parse(res).error, "rate_limited");
  assert.equal(
    f.calls.length,
    0,
    "the whole point is to reject before the outbound siteverify round trip",
  );
  const { retryAfter } = parse(res);
  assert.ok(retryAfter > 1 && retryAfter <= __limits.GLOBAL_WINDOW_S, `retryAfter=${retryAfter}`);
});

test("a request rejected by its OWN per-IP limit does not consume the global budget", async () => {
  // Ordering regression: the global counter used to be bumped BEFORE the per-IP
  // gate, so one throttled IP could exhaust the all-IP budget and 429 the form
  // for everyone else — defeating the counter's stated purpose.
  const ddb = makeDdb();
  install({ ddb });
  const ipK = __windowKey(`IP#203.0.113.5`, __limits.IP_WINDOW_S).key;
  const globalK = __windowKey("GLOBAL#siteverify", __limits.GLOBAL_WINDOW_S).key;
  ddb.counts.set(ipK, __limits.IP_MAX); // next bump trips the per-IP limit

  const res = await handler(event());
  assert.equal(res.statusCode, 429);
  assert.equal(
    ddb.counts.get(globalK),
    undefined,
    "an IP-throttled request must not have touched the shared global counter",
  );
});


// ---------------------------------------------------------------------------
// The op -> SDK command map.
//
// These tests exist because the 46 tests above CANNOT catch a wrong command:
// they inject a stub at the _ddbSend seam (see ddbStub) which implements
// DeleteItem itself, so the real map is never exercised. A two-way ternary sent
// every DeleteItem out as an UpdateItem for as long as the rollback existed.
// ---------------------------------------------------------------------------

test("every op maps to its OWN command class", () => {
  assert.equal(__commandNameFor("PutItem"), "PutItemCommand");
  assert.equal(__commandNameFor("UpdateItem"), "UpdateItemCommand");
  // The regression. UpdateItem UPSERTS, so routing DeleteItem here did not
  // delete the duplicate marker and did not throw — the sender's retry was
  // answered ok:true with no mail for the 24h TTL.
  assert.equal(__commandNameFor("DeleteItem"), "DeleteItemCommand");
});

test("an unsupported op throws instead of falling through to a wrong command", () => {
  assert.throws(() => __commandNameFor("Scan"), /unsupported op/);
  assert.throws(() => __commandNameFor(""), /unsupported op/);
  assert.throws(() => __commandNameFor(undefined), /unsupported op/);
});

test("the map covers every op the handler actually calls", async () => {
  // The discriminating check: read our own source, find every ddb("X", …) call
  // site, and require the map to know X. This is what would have caught the
  // original defect, and it keeps catching it for any op added later.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("./index.mjs", import.meta.url)), "utf8");
  const ops = [...src.matchAll(/\bddb\(\s*"([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.ok(ops.length >= 3, `expected to find ddb() call sites, found ${ops.length}`);
  assert.ok(ops.includes("DeleteItem"), "the rollback call site must be present");
  for (const op of new Set(ops)) {
    assert.ok(__DDB_COMMANDS[op], `ddb("${op}") has no entry in __DDB_COMMANDS`);
  }
});

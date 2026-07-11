// Unit tests for the contact Lambda: exercises every control's pass AND fail
// path. DynamoDB, SSM, and fetch are stubbed (no network, no AWS).
//   node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { handler, __setTestDeps, __resetTestDeps } from "./index.mjs";

process.env.TURNSTILE_SECRET_PARAM = "/p/turnstile-secret";
process.env.APPS_SCRIPT_URL_PARAM = "/p/apps-script-url";
process.env.APPS_SCRIPT_SECRET_PARAM = "/p/apps-script-secret";
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
function makeDdb() {
  const puts = new Set();
  const counts = new Map();
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
    if (op === "UpdateItem") {
      const pk = params.Key.pk.S;
      const next = (counts.get(pk) ?? 0) + 1;
      counts.set(pk, next);
      return { Attributes: { cnt: { N: String(next) } } };
    }
    throw new Error(`unexpected op ${op}`);
  };
  return { send, puts, counts, calls };
}

// Configurable fetch stub for siteverify + Apps Script.
function makeFetch({ verify, verifyStatus = 200, forwardOk = true } = {}) {
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
    // Apps Script forward
    return { ok: forwardOk, status: forwardOk ? 200 : 500, json: async () => ({}) };
  };
  return { fn, calls };
}

function install({ ddb, verify, verifyStatus, forwardOk } = {}) {
  const d = ddb ?? makeDdb();
  const goodVerify = {
    success: true,
    hostname: "agusgonzaleznic.com",
    action: "contact",
    challenge_ts: tsAgo(30),
  };
  const f = makeFetch({
    verify: verify ?? goodVerify,
    verifyStatus,
    forwardOk,
  });
  __resetTestDeps();
  __setTestDeps({
    ddbSend: d.send,
    getParam: async (name) => {
      if (name === process.env.TURNSTILE_SECRET_PARAM) return "SECRET";
      if (name === process.env.APPS_SCRIPT_SECRET_PARAM) return "FWD-SECRET";
      return "https://script/exec";
    },
  });
  globalThis.fetch = f.fn;
  return { ddb: d, fetch: f };
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
  const { fetch } = install();
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
test("oversized Content-Length -> 413", async () => {
  install();
  const res = await handler(event({ contentLength: 9000 }));
  assert.equal(res.statusCode, 413);
});

test("oversized actual body (spoofed small Content-Length) -> 413", async () => {
  install();
  const big = JSON.stringify(body({ message: "x".repeat(9000) }));
  const res = await handler(event({ rawBody: big, contentLength: 10 }));
  assert.equal(res.statusCode, 413);
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
  const { ddb } = install();
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
test("per-IP over limit -> 429", async () => {
  const { ddb } = install();
  ddb.counts.set("IP#203.0.113.5", 5); // next bump -> 6 > 5
  const res = await handler(event());
  assert.equal(res.statusCode, 429);
  assert.deepEqual(parse(res), { ok: false, error: "rate_limited" });
});

test("IPv6 callers in the same /64 share one per-IP bucket", async () => {
  const { ddb } = install();
  ddb.counts.set("IP#2001:db8:1:2::/64", 5); // next bump -> 6 > 5
  // A different interface id inside the same /64 must map to the same bucket.
  const res = await handler(event({ ip: "2001:db8:1:2:aaaa:bbbb:cccc:dddd:443" }));
  assert.equal(res.statusCode, 429);
  assert.deepEqual(parse(res), { ok: false, error: "rate_limited" });
});

test("per-IP rate limit is enforced BEFORE the siteverify network call", async () => {
  const { ddb, fetch } = install();
  ddb.counts.set("IP#203.0.113.5", 5); // next bump -> 6 > 5
  const res = await handler(event());
  assert.equal(res.statusCode, 429);
  // No outbound siteverify happened — the flood is bounded before that spend.
  assert.equal(fetch.calls.length, 0);
});

// --- Control 9: per-email rate limit -----------------------------------------
test("per-email over limit -> 429", async () => {
  const { ddb } = install();
  ddb.counts.set("EMAIL#ada@example.com", 3); // next bump -> 4 > 3
  const res = await handler(event());
  assert.equal(res.statusCode, 429);
});

// --- Control 10: duplicate suppression ---------------------------------------
test("duplicate message -> silent 200, not forwarded", async () => {
  const { ddb, fetch } = install();
  const dupBody = body({ message: "This exact message repeats across sends." });
  // Pre-seed the DUP# row so the first request in THIS test is a duplicate.
  // Compute the same key the handler would (email lowercased + normalized msg).
  const r1 = await handler(event({ bodyObj: dupBody }));
  assert.equal(r1.statusCode, 200);
  const forwardsAfterFirst = fetch.calls.filter((c) =>
    String(c.url).includes("script"),
  ).length;
  // Second send, same email+message, fresh token -> duplicate -> 200 silent.
  const r2 = await handler(
    event({ bodyObj: { ...dupBody, turnstileToken: `tok-fresh-${tokenSeq++}` } }),
  );
  assert.equal(r2.statusCode, 200);
  const forwardsAfterSecond = fetch.calls.filter((c) =>
    String(c.url).includes("script"),
  ).length;
  assert.equal(forwardsAfterFirst, 1);
  assert.equal(forwardsAfterSecond, 1); // no additional forward
});

// --- Forward failure ---------------------------------------------------------
test("Apps Script non-2xx -> 502", async () => {
  install({ forwardOk: false });
  const res = await handler(event());
  assert.equal(res.statusCode, 502);
  assert.deepEqual(parse(res), { ok: false, error: "delivery" });
});

// --- Happy path --------------------------------------------------------------
test("happy path -> 200 ok, forwards sanitized payload", async () => {
  const { fetch } = install();
  const res = await handler(event());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(parse(res), { ok: true });
  const fwd = fetch.calls.find((c) => String(c.url).includes("script"));
  assert.ok(fwd, "forwarded to Apps Script");
  const sent = JSON.parse(fwd.opts.body);
  assert.deepEqual(
    Object.keys(sent).sort(),
    ["email", "message", "name", "role", "secret"],
  );
  assert.equal(sent.email, "ada@example.com");
  // Server-only shared secret is injected so the Apps Script can reject any
  // POST that doesn't carry it (the /exec URL alone is not a secret).
  assert.equal(sent.secret, "FWD-SECRET");
});

test("true IP is parsed from CloudFront-Viewer-Address (port stripped)", async () => {
  const { fetch } = install();
  await handler(event({ ip: "198.51.100.10:52345" }));
  const sv = fetch.calls.find((c) => String(c.url).includes("siteverify"));
  assert.match(sv.opts.body, /remoteip=198\.51\.100\.10(?!%3A)/);
});

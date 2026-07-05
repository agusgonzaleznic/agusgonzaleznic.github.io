// Storyblok webhook receiver: verifies a shared URL token, then dispatches the
// GitHub Actions deploy workflow (with a queued-run debounce).
// Zero npm deps: global fetch + @aws-sdk/client-ssm (bundled in nodejs22.x).

import { createHash, timingSafeEqual } from "node:crypto";

const {
  GITHUB_REPO,
  WORKFLOW_FILE,
  SSM_URL_TOKEN_PARAM,
  SSM_GITHUB_PAT_PARAM,
} = process.env;

const REBUILD_ACTIONS = new Set(["published", "unpublished", "deleted", "moved"]);
const CACHE_TTL_MS = 5 * 60 * 1000;
const paramCache = new Map(); // name -> { value, expiresAt } (warm invocations)

let ssmClient;

async function getParam(name) {
  // TEST PATH (local unit-sanity only, never set on the deployed function):
  // TEST_MODE=1 reads secrets from env instead of SSM.
  if (process.env.TEST_MODE === "1") {
    return name === SSM_URL_TOKEN_PARAM
      ? process.env.TEST_URL_TOKEN
      : process.env.TEST_GITHUB_PAT;
  }

  const hit = paramCache.get(name);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  // Dynamic import so the TEST_MODE path runs without the SDK installed.
  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
  ssmClient ??= new SSMClient({});
  const res = await ssmClient.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );
  const value = res.Parameter?.Value;
  paramCache.set(name, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function tokenMatches(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || !expected) {
    return false;
  }
  // Hash both sides: constant-time compare, independent of input length.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function respond(statusCode, body) {
  if (body === undefined) return { statusCode };
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function github(method, path, pat, body) {
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${pat}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "agusgonzaleznic-storyblok-rebuild",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method ?? "";
  const provided = event?.queryStringParameters?.token;
  const expected = await getParam(SSM_URL_TOKEN_PARAM);
  if (!tokenMatches(provided, expected)) return respond(401, {});

  if (method === "GET") return respond(200, { ok: true });
  if (method !== "POST") return respond(405, {});

  let payload;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : event.body ?? "";
    payload = JSON.parse(raw);
  } catch {
    return respond(400, {});
  }

  // Only story events trigger a rebuild; anything else is acknowledged as a no-op.
  const action = payload?.action;
  if (payload?.story_id == null || !REBUILD_ACTIONS.has(action)) {
    return respond(204);
  }

  // Log action + slug only — never the token, PAT, or raw body.
  console.log(JSON.stringify({ action, slug: payload.full_slug ?? "" }));

  const pat = await getParam(SSM_GITHUB_PAT_PARAM);
  const workflowBase = `/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}`;

  // Debounce: if a run is already queued it will pick up this change.
  const runsRes = await github(
    "GET",
    `${workflowBase}/runs?status=queued&per_page=1`,
    pat,
  );
  if (runsRes.ok) {
    const runs = await runsRes.json();
    if ((runs.total_count ?? 0) > 0) {
      return respond(202, { ok: true, status: "already queued" });
    }
  }
  // On debounce-check failure, fall through and dispatch anyway.

  const dispatchRes = await github("POST", `${workflowBase}/dispatches`, pat, {
    ref: "main",
  });
  if (dispatchRes.status !== 204) {
    console.error(
      JSON.stringify({ msg: "dispatch failed", status: dispatchRes.status }),
    );
    return respond(502, {});
  }
  return respond(202, { ok: true, status: "dispatched" });
};

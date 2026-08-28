// Runner for the end-to-end suites: serve dist/, run tests/e2e, stop serving.
//
//   npm run test:e2e            (expects dist/ to exist; run npm run build first)
//
// Deliberately NOT part of `npm run build`. These tests need a served build and a
// browser, so folding them into the build would make every build depend on both.
//
// Serves the built output with `vite preview` rather than a plain static server,
// because the site prerenders clean URLs (/about, not /about.html) and a naive
// server would 404 on every route except the root.

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const PORT = Number(process.env.E2E_PORT || 4173);
const BASE = `http://localhost:${PORT}`;

if (!existsSync(resolve(root, "dist", "index.html"))) {
  console.error(
    "e2e: dist/index.html is missing. These suites exercise the BUILT site, so run\n" +
      "     `npm run build` first (a stale dist would test the wrong thing silently).",
  );
  process.exit(1);
}

const preview = spawn(
  "npx",
  ["vite", "preview", "--port", String(PORT), "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);

let previewOut = "";
preview.stdout.on("data", (d) => (previewOut += d));
preview.stderr.on("data", (d) => (previewOut += d));

const stop = () => {
  if (!preview.killed) preview.kill("SIGTERM");
};
process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

// Wait for the server rather than sleeping a guessed interval: a fixed sleep is
// either flaky on a cold machine or wasted time on a warm one.
async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status > 0) return true;
    } catch {
      /* not up yet */
    }
    if (preview.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

if (!(await waitForServer(BASE + "/"))) {
  console.error(`e2e: vite preview did not come up on ${BASE}\n${previewOut}`);
  stop();
  process.exit(1);
}
console.log(`e2e: serving dist/ at ${BASE}`);

// Enumerate the spec files here rather than passing a glob.
//
// Two reasons. `node --test tests/e2e/` treats EVERY .mjs in the directory as a
// test file, so helpers.mjs would be "run" as a suite (the same trap is
// documented on the scripts/lib step in .github/workflows/ci.yml). And handing a
// glob to the shell needs `shell: true`, which node warns about (DEP0190) and
// which would make the argument list depend on the shell rather than on this
// file. Reading the directory keeps both problems out.
const specs = readdirSync(resolve(root, "tests", "e2e"))
  .filter((f) => f.endsWith(".test.mjs"))
  .sort()
  .map((f) => `tests/e2e/${f}`);

// A FLOOR, not a zero check. Deleting a spec file, or renaming one out of tests/,
// is a silent loss: the runner runs what is left and reports a green pass. Raise
// this deliberately when a suite is added.
const MIN_SPECS = 6;
if (specs.length < MIN_SPECS) {
  console.error(
    `e2e: found ${specs.length} spec file(s) in tests/e2e, expected at least ${MIN_SPECS}` +
      `${specs.length ? `: ${specs.join(", ")}` : ""}.\n` +
      "     Either a suite went missing, or MIN_SPECS in this file needs raising.",
  );
  stop();
  process.exit(1);
}
console.log(`e2e: ${specs.length} spec file(s): ${specs.map((s) => s.split("/").pop()).join(", ")}`);

const tests = spawn("node", ["--test", ...specs], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, E2E_BASE: BASE },
});

tests.on("exit", (code) => {
  stop();
  process.exit(code ?? 1);
});

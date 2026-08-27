// Type-check every TS project, and prove the check is actually looking at files.
//
// Why this is a script and not just `tsc --noEmit`:
//
// tsconfig.json here is a SOLUTION file: `"files": []` plus `references`. Run
// bare `tsc --noEmit` against it and TypeScript resolves ZERO input files, prints
// nothing, and exits 0. It is a perfect green check that verifies nothing. That
// is not hypothetical: it hid 14 real type errors in this repo indefinitely, and
// a duplicate `const` that only esbuild ever caught, because "tsc --noEmit
// exit=0" was being reported as evidence the types were clean.
//
// Build mode (`tsc -b`) does traverse the references, but it also drops
// *.tsbuildinfo files in the repo root. So each project is checked explicitly,
// and the file count is asserted: a config change that silently empties a
// project's input set fails here instead of turning into a green no-op.

import { spawnSync } from "node:child_process";

// Minimum input files per project. Deliberately loose: this is a canary for
// "the project resolved to nothing", not a coverage metric to keep updating.
const PROJECTS = [
  { config: "tsconfig.app.json", minFiles: 50 },
  { config: "tsconfig.node.json", minFiles: 1 },
];

const tsc = (args) =>
  spawnSync("npx", ["tsc", ...args], { encoding: "utf8", shell: false });

let failed = false;

for (const { config, minFiles } of PROJECTS) {
  // 1. Does this project actually resolve local input files?
  const listed = tsc(["-p", config, "--noEmit", "--listFilesOnly"]);
  const localFiles = (listed.stdout || "")
    .split("\n")
    .filter((l) => l.trim() && !l.includes("node_modules") && !l.includes("npm notice"));

  if (localFiles.length < minFiles) {
    console.error(
      `\n✖ typecheck: ${config} resolved only ${localFiles.length} local input file(s), expected >= ${minFiles}.\n` +
        "  The type check would pass without checking anything. Fix the project's\n" +
        "  `include`/`files` rather than lowering this threshold.\n",
    );
    failed = true;
    continue;
  }

  // 2. Now the check itself is worth running.
  const result = tsc(["-p", config, "--noEmit"]);
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("")
    .split("\n")
    .filter((l) => !l.startsWith("npm notice"))
    .join("\n")
    .trim();

  if (result.status !== 0) {
    console.error(`\n✖ typecheck: ${config}\n${output}\n`);
    failed = true;
  } else {
    console.log(`✓ typecheck: ${config}, ${localFiles.length} file(s), no errors`);
  }
}

process.exit(failed ? 1 : 0);

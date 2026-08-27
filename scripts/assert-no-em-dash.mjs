// The em dash is out of this repo's prose, and this keeps it out.
//
// A one-time sweep decays: the next comment, doc, workflow name or piece of copy
// reintroduces the character, and nobody notices in review. So the rule is
// enforced here instead of remembered, over every tracked text file.
//
// It is a RATCHET, not a wall. The files still holding the character are listed
// below with the exact count they are allowed, because each is a different kind
// of exception: data that must keep the character, content that lives in the CMS
// rather than in this repo, or deployed code whose sweep needs a production
// apply. A file over its number fails, a file with no number fails on the first
// occurrence, and a number can only ever be lowered.
//
//   node scripts/assert-no-em-dash.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// U+2014 em dash, U+2015 horizontal bar, U+2E3A two-em dash. The en dash U+2013
// is deliberately NOT here: it is correct in a numeric range, and as the
// Gedankenstrich in German and the raya in Spanish.
const FORBIDDEN = ["\u2014", "\u2015", "\u2E3A"];

const BUDGET = {
  // An HTML entity decoder: &mdash; must decode to the actual character, and its
  // test must assert exactly that. Changing either would be a bug.
  "scripts/lib/post-import.mjs": 1,
  "scripts/lib/post-import.test.mjs": 1,
  // Cached machine translations of copy that lives in Storyblok, not here. These
  // entries follow the CMS copy, so they are retired when it is.
  "scripts/.i18n-cache.json": 561,
  // The canonical English page copy, which is seeded into the CMS. Retired
  // together with the published stories so the two never disagree.
  "scripts/seed-storyblok-pages.mjs": 35,
  // Deployed code: an edit here changes a Lambda zip or a CloudFront function and
  // so needs a gated production apply, which a punctuation sweep should not
  // trigger on its own.
  "terraform/cdn-function/handler.js.tftpl": 6,
  "terraform/cdn-function/handler.test.mjs": 3,
  "terraform/contact-lambda-src/index.mjs": 17,
  "terraform/contact-lambda-src/index.test.mjs": 13,
  "terraform/lambda-src/storyblok-rebuild/index.mjs": 1,
  // Remote resource attributes (a CloudWatch alarm description, a Storyblok field
  // description), for the same reason.
  "terraform/observability.tf": 2,
  "terraform/storyblok.tf": 3,
};

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\u0000")
  .filter(Boolean);

const failures = [];
const tightenable = [];
let scanned = 0;

for (const rel of tracked) {
  let text;
  try {
    text = readFileSync(resolve(root, rel), "utf8");
  } catch {
    continue; // gone, or unreadable as text
  }
  if (text.includes("\u0000")) continue; // binary
  scanned += 1;
  const count = FORBIDDEN.reduce((n, c) => n + text.split(c).length - 1, 0);
  const allowed = BUDGET[rel] ?? 0;
  if (count > allowed) {
    const where = [];
    text.split("\n").forEach((line, i) => {
      if (FORBIDDEN.some((c) => line.includes(c))) where.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
    failures.push({ rel, count, allowed, where: where.slice(0, 6) });
  } else if (count < allowed) {
    tightenable.push(`${rel}: allowed ${allowed}, now ${count}`);
  }
}

if (tightenable.length) {
  console.log("assert-no-em-dash: these budgets can be tightened (lower the number in this script):");
  for (const l of tightenable) console.log(`  ${l}`);
}

if (failures.length) {
  console.error("\nassert-no-em-dash: FAILED. The em dash is not allowed in this repo's prose.\n");
  for (const f of failures) {
    console.error(`  ${f.rel}: ${f.count} occurrence(s), ${f.allowed} allowed`);
    for (const w of f.where) console.error(`      ${w}`);
    if (f.count > f.where.length) console.error(`      ... and ${f.count - f.where.length} more`);
  }
  console.error(
    "\nRewrite with a comma, a colon, a semicolon, parentheses, or two sentences,\n" +
      "whichever the sentence needs. The en dash is correct in a numeric range, and as\n" +
      "the Gedankenstrich in German or the raya in Spanish.\n",
  );
  console.log(`::error title=Em dash::${failures.length} file(s) contain a forbidden dash`);
  process.exit(1);
}

console.log(
  `\u2713 assert-no-em-dash: ${scanned} tracked text file(s) clean ` +
    `(${Object.keys(BUDGET).length} budgeted exception(s), ${Object.values(BUDGET).reduce((a, b) => a + b, 0)} allowed occurrence(s)).`,
);

// Refuse to build if the Lingui catalogs are stale relative to the source.
//
// WHY THIS EXISTS
//
// All six /privacy pages once published this where the GDPR contact-form
// disclosure belongs:
//
//     3. Contact form  -kGSzl 4t3R9G 03THJk PLP2u3  Retention: ...
//
// Four paragraphs replaced by raw Lingui message IDs, on every locale copy
// including English. The copy had been written months earlier; `lingui extract`
// was simply never re-run, so the compiled catalogs had no entry for those ids.
// @lingui/swc-plugin STRIPS the fallback `message` prop in production builds, so
// a missing id has nothing to fall back to and renders the id itself.
//
// That is why no one caught it: `npm run dev` keeps the fallback and shows the
// real text. The defect existed ONLY in the built output.
//
// Note what this means for the shape of the check. The failure mode is NOT
// "English leaked into a translated page" — the usual i18n heuristic of comparing
// msgstr to msgid would not have found this, because the entry was absent, not
// untranslated. The only reliable question is: does `lingui extract` still agree
// with the source?
//
// HOW
//
// Snapshot the catalogs, run extract, compare, restore. The working tree is left
// byte-identical either way, so this is safe to run locally and in CI, and it
// cannot itself become a source of diff noise. Verified that extract is
// idempotent on a clean tree, which is what makes a diff meaningful.
//
// An entry that EXISTS with an empty msgstr is a different, much milder problem:
// the page renders readable English instead of a hash. That is reported loudly
// but does NOT fail the build — failing it would block every unrelated PR behind
// a human translation task, and the whole point of a guard is that people keep
// listening to it.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsePo, isHeader } from "./lib/po.mjs";

const DIR = "src/i18n/catalogs";
const poFiles = () => readdirSync(DIR).filter((f) => f.endsWith(".po")).sort();

const msgids = (text) =>
  new Set(parsePo(text).filter((e) => !isHeader(e)).map((e) => e.msgid));

const before = new Map(poFiles().map((f) => [f, readFileSync(join(DIR, f), "utf8")]));

let extractStatus;
const changed = [];
try {
  // --clean matches how these catalogs are maintained (see the i18n:extract
  // script). Without it, obsolete entries would accumulate in the repo and this
  // guard would report a diff that `npm run i18n:extract` does not fix.
  const r = spawnSync("npx", ["lingui", "extract", "--clean"], { encoding: "utf8" });
  extractStatus = r.status;
  if (r.status !== 0) {
    console.error("\n✖ i18n: `lingui extract` itself failed:\n" + (r.stderr || r.stdout));
  } else {
    for (const f of poFiles()) {
      const after = readFileSync(join(DIR, f), "utf8");
      const old = before.get(f);
      if (old === undefined) {
        changed.push({ f, added: [...msgids(after)], removed: [], newFile: true });
      } else if (old !== after) {
        const a = msgids(after);
        const b = msgids(old);
        changed.push({
          f,
          added: [...a].filter((x) => !b.has(x)),
          removed: [...b].filter((x) => !a.has(x)),
        });
      }
    }
  }
} finally {
  // Always put the tree back. A catalog extract CREATED (a locale added to
  // lingui.config.ts but never extracted) has no snapshot to restore, so it is
  // removed outright — otherwise this guard would leave a stray untracked .po
  // behind and become a source of the very diff noise it is meant to detect.
  for (const f of poFiles()) {
    const old = before.get(f);
    if (old === undefined) {
      rmSync(join(DIR, f), { force: true });
    } else if (readFileSync(join(DIR, f), "utf8") !== old) {
      writeFileSync(join(DIR, f), old);
    }
  }
}

if (extractStatus !== 0) process.exit(1);

if (changed.length) {
  const trim = (s) => (s.length > 96 ? `${s.slice(0, 96)}…` : s);
  console.error("\n✖ i18n: the message catalogs are STALE.\n");
  for (const { f, added, removed, newFile } of changed) {
    console.error(`  ${f}${newFile ? "  (missing entirely)" : ""}`);
    for (const m of added.slice(0, 8)) console.error(`    + ${trim(m)}`);
    if (added.length > 8) console.error(`    + …and ${added.length - 8} more`);
    for (const m of removed.slice(0, 8)) console.error(`    - ${trim(m)}`);
    if (removed.length > 8) console.error(`    - …and ${removed.length - 8} more`);
  }
  console.error(
    "\n  A message used in src/ but absent from the catalogs does not fall back to\n" +
      "  English in a production build — it renders its raw ID (e.g. `-kGSzl`),\n" +
      "  because @lingui/swc-plugin strips the fallback text. `npm run dev` hides\n" +
      "  this completely.\n\n" +
      "  Fix: npm run i18n:extract   (then translate the new messages, or ship them\n" +
      "  knowing those strings render in English until you do.)\n",
  );
  process.exit(1);
}

// Catalogs are current. Report untranslated messages — readable English, not a
// hash, so this is a warning rather than a failure.
const gaps = [];
// An ICU plural whose translation is byte-identical to English. Reported
// separately because it is NOT the same situation as an empty msgstr: the
// translator cannot produce these at all (protect() masks a plural as one
// sentinel, sub-messages included), so they will never fill themselves in and
// need translating by hand. The generic "msgstr equals msgid" heuristic is
// useless site-wide — plenty of strings are legitimately identical — but for a
// plural it is unambiguous.
const untranslatedPlurals = [];
const IS_PLURAL = /\{[^{}]*,\s*(plural|select|selectordinal)\s*,/;
for (const f of poFiles()) {
  if (f === "en.po") continue;
  const entries = parsePo(before.get(f)).filter((e) => !isHeader(e));
  const empty = entries.filter((e) => !e.msgstr?.trim());
  if (empty.length) gaps.push({ f, n: empty.length, sample: empty[0].msgid });
  const stuck = entries.filter((e) => IS_PLURAL.test(e.msgid) && e.msgstr?.trim() === e.msgid);
  if (stuck.length) untranslatedPlurals.push({ f, n: stuck.length, sample: stuck[0].msgid });
}
console.log("✓ i18n: catalogs match the source");
const trim = (s) => (s.length > 70 ? `${s.slice(0, 70)}…` : s);
if (gaps.length) {
  console.log(
    `⚠ i18n: untranslated messages — these render in ENGLISH on translated pages:\n` +
      gaps.map((g) => `    ${g.f}: ${g.n}  e.g. "${trim(g.sample)}"`).join("\n"),
  );
}
if (untranslatedPlurals.length) {
  console.log(
    "⚠ i18n: ICU plurals still identical to English — the translator CANNOT produce\n" +
      "  these (they are masked whole), so they need translating by hand:\n" +
      untranslatedPlurals.map((g) => `    ${g.f}: ${g.n}  e.g. "${trim(g.sample)}"`).join("\n"),
  );
}

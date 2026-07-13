// Auto-open a review PR for every DE/ES blog translation that is new or whose
// English source changed. Runs in CI (.github/workflows/translate-pr.yml) after
// a deploy, and on manual dispatch.
//
// For each published article, for each review-gated locale (de/es) that is NOT
// already approved+hash-fresh, it machine-translates that article (DeepL + LLM
// post-edit), writes content/translations/<uuid>.<locale>.json, sets the
// manifest entry to "pending" with the current sourceHash, and opens/updates a
// per-article PR on branch translate/<uuid>. You publish by flipping the entry
// to "approved" in content/i18n-approvals.json and merging.
//
// INVARIANTS:
//   - NEVER writes "approved" and NEVER touches English — approval is a human
//     merge; this only ever proposes "pending" translations.
//   - IDEMPOTENT: an article whose open PR already carries the current English
//     hash is skipped, so a re-run never clobbers in-progress review edits.
//   - Exits 0 with no PR when everything is approved+current.
//   - --dry-run does all translation + file writes but no git/gh (local test).
//   - FORCE_UUIDS=<uuid,...> forces those articles into the review set even if
//     approved+fresh (for testing the automation end to end).

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  createTranslator,
  hasApiKey,
  loadCache,
  loadGlossary,
  loadGlossaryTerms,
} from "./lib/deepl.mjs";
import { createPostEditor, hasAnthropicKey, POSTEDIT_VERSION } from "./lib/llm-postedit.mjs";
import { translateStories } from "./lib/richtext-translate.mjs";
import { fetchPublishedPosts } from "./lib/storyblok-fetch.mjs";
import {
  REVIEW_GATED_LOCALES,
  approvedGatedLocales,
  enSourceHash,
  loadApprovals,
} from "./lib/blog-gate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const approvalsPath = resolve(__dirname, "../content/i18n-approvals.json");
const reviewedDir = resolve(__dirname, "../content/translations");
const cachePath = resolve(__dirname, ".i18n-cache.json");
const glossaryPath = resolve(__dirname, "i18n-glossary.json");

const dryRun = process.argv.includes("--dry-run");
const forceUuids = new Set(
  (process.env.FORCE_UUIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);
const token = process.env.STORYBLOK_PUBLIC_TOKEN;

const BOT_NAME = "github-actions[bot]";
const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

function fail(msg) {
  console.error(`translate-pr: ${msg}`);
  process.exit(1);
}

// execFile with array args (no shell → no injection). Returns trimmed stdout.
function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

// Short, pipe-safe one-line cell for the PR table.
function cell(text, max = 80) {
  const s = String(text ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s || "—";
}

function reviewedTranslation(uuid, locale) {
  return JSON.parse(readFileSync(resolve(reviewedDir, `${uuid}.${locale}.json`), "utf-8"));
}

function prBody(post, locales) {
  const rows = [["Title", post.title], ["Excerpt", post.excerpt]].map(([label, en]) => {
    const cols = locales.map((loc) => cell(reviewedTranslation(post.uuid, loc)[label === "Title" ? "title" : "excerpt"]));
    return `| ${label} | ${cell(en)} | ${cols.join(" | ")} |`;
  });
  const header = `| Field | EN | ${locales.map((l) => l.toUpperCase()).join(" | ")} |`;
  const sep = `|---|---|${locales.map(() => "---").join("|")}|`;
  return [
    `## Translation review — \`${post.slug}\``,
    "",
    `Machine-translated (DeepL + Claude post-edit) **${locales.map((l) => l.toUpperCase()).join(" / ")}** for this article — pending your native review. This is not yet published.`,
    "",
    header,
    sep,
    ...rows,
    "",
    "The full body translation is in the changed `content/translations/*.json` file(s) in this PR's diff.",
    "",
    "**To publish:** in `content/i18n-approvals.json`, change `\"status\": \"pending\"` → `\"approved\"` for the locale(s) you accept, then **merge** — merging deploys them. Leave pending (or close) to keep them gated. Editing the English original later auto-demotes an approved translation until it is re-reviewed.",
    "",
    "_Opened automatically by the translation pipeline._",
  ].join("\n");
}

async function main() {
  if (!token) fail("STORYBLOK_PUBLIC_TOKEN is required.");
  if (!hasApiKey()) fail("DEEPL_API_KEY is required.");
  if (!hasAnthropicKey()) fail("ANTHROPIC_API_KEY is required (review quality depends on the post-edit).");
  if (!dryRun && !process.env.GH_TOKEN) fail("GH_TOKEN (the PR-write PAT) is required unless --dry-run.");

  const posts = await fetchPublishedPosts({ token });
  const mainApprovals = loadApprovals(approvalsPath);

  // Work list: articles with >=1 gated locale that is not approved+fresh on main.
  const work = posts
    .map((post) => {
      const fresh = approvedGatedLocales(post, mainApprovals);
      const needed = REVIEW_GATED_LOCALES.filter(
        (loc) => forceUuids.has(post.uuid) || !fresh.includes(loc),
      );
      return { post, needed };
    })
    .filter((w) => w.needed.length > 0);

  if (work.length === 0) {
    console.log("✓ translate-pr: all DE/ES translations are approved and current — nothing to review.");
    return;
  }
  console.log(`translate-pr: ${work.length} article(s) with translations to review.`);

  // Translator (DeepL + LLM post-edit), shared across articles.
  const cache = loadCache(cachePath);
  const glossaryRegex = loadGlossary(glossaryPath);
  const postEditor = createPostEditor({
    apiKey: process.env.ANTHROPIC_API_KEY.trim(),
    glossaryTerms: loadGlossaryTerms(glossaryPath),
  });
  const translator = createTranslator({
    apiKey: process.env.DEEPL_API_KEY.trim(),
    glossaryRegex,
    cache,
    postEditor,
    cacheSalt: POSTEDIT_VERSION,
  });

  if (!dryRun) {
    git(["config", "user.name", BOT_NAME]);
    git(["config", "user.email", BOT_EMAIL]);
    git(["fetch", "origin", "--quiet"]);
  }

  mkdirSync(reviewedDir, { recursive: true });
  const opened = [];
  let hadError = false;

  for (const { post, needed } of work) {
    const hash = enSourceHash(post);
    const branch = `translate/${post.uuid}`;
    try {
      // Idempotency: if an open PR already carries the current hash for every
      // needed locale, skip — don't regenerate or clobber in-progress edits.
      if (!dryRun) {
        const open = JSON.parse(
          gh(["pr", "list", "--head", branch, "--state", "open", "--json", "number", "--limit", "1"]) || "[]",
        );
        if (open.length > 0) {
          let branchManifest = {};
          try {
            branchManifest = JSON.parse(git(["show", `origin/${branch}:content/i18n-approvals.json`]));
          } catch {
            branchManifest = {};
          }
          const allCurrent = needed.every((loc) => branchManifest[post.uuid]?.[loc]?.sourceHash === hash);
          if (allCurrent) {
            console.log(`  = ${post.slug}: PR #${open[0].number} already current — skipped.`);
            continue;
          }
        }
        // HARD-reset the working tree to main so nothing from a prior article
        // — a carried-over tracked edit OR a stray untracked file left by a
        // mid-article failure — can leak into this branch. `checkout -B` alone
        // removes neither (verified), so reset + clean are both required.
        git(["checkout", "-B", branch, "origin/main", "--quiet"]);
        git(["reset", "--hard", "origin/main", "--quiet"]);
        git(["clean", "-fd", "content/"]);
      }

      // Translate ALL needed locales FIRST, into memory. If any throws (e.g. a
      // DeepL 429 on the 2nd locale) it happens BEFORE any file is written, so a
      // failed article leaves zero partial files behind (per-article isolation).
      const translated = [];
      for (const loc of needed) {
        translated.push([loc, (await translateStories([post], loc, translator))[0]]);
      }

      // Apply ONLY this article's pending entries onto main's manifest, then write.
      const manifest = loadApprovals(approvalsPath);
      manifest[post.uuid] = manifest[post.uuid] ?? {};
      for (const [loc, localized] of translated) {
        writeFileSync(
          resolve(reviewedDir, `${post.uuid}.${loc}.json`),
          `${JSON.stringify(localized, null, 2)}\n`,
        );
        manifest[post.uuid][loc] = {
          status: "pending",
          sourceHash: hash,
          provenance: "auto-mt",
          reviewedAt: null,
        };
      }
      writeFileSync(approvalsPath, `${JSON.stringify(manifest, null, 2)}\n`);

      if (dryRun) {
        console.log(`  ~ ${post.slug}: would open/update ${branch} for ${needed.join(", ")} (dry-run, no git/gh).`);
        continue;
      }

      // Stage ONLY this article's files (never a blanket `content/` add), so
      // even an unexpected leftover can't be swept into this commit.
      git([
        "add",
        "content/i18n-approvals.json",
        ...needed.map((loc) => `content/translations/${post.uuid}.${loc}.json`),
      ]);
      // Nothing staged means the regenerated content matches the branch already.
      const staged = git(["diff", "--cached", "--name-only"]);
      if (!staged) {
        console.log(`  = ${post.slug}: no content change — skipped.`);
        continue;
      }
      git(["commit", "--no-verify", "-m", `chore(i18n): machine-translate ${post.slug} for review`]);
      git(["push", "--force-with-lease", "origin", branch, "--quiet"]);

      const existing = JSON.parse(
        gh(["pr", "list", "--head", branch, "--state", "open", "--json", "number", "--limit", "1"]) || "[]",
      );
      const bodyFile = resolve(tmpdir(), `pr-${post.uuid}.md`);
      writeFileSync(bodyFile, prBody(post, needed));
      const title = `Translate: ${post.slug} (${needed.map((l) => l.toUpperCase()).join("/")})`;
      if (existing.length > 0) {
        gh(["pr", "edit", String(existing[0].number), "--title", title, "--body-file", bodyFile]);
        opened.push(`updated PR #${existing[0].number} (${post.slug})`);
      } else {
        gh(["pr", "create", "--base", "main", "--head", branch, "--title", title, "--body-file", bodyFile]);
        opened.push(`opened PR (${post.slug})`);
      }
    } catch (err) {
      hadError = true;
      console.error(`  ✗ ${post.slug}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(opened.length ? `✓ translate-pr: ${opened.join("; ")}.` : "✓ translate-pr: no PR changes.");
  if (hadError) process.exit(1);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));

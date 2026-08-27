// scripts/lib/tag-i18n.mjs: localized labels for the global Storyblok tag_list.
//
// Storyblok's native tag_list is global (one set of English tags per story,
// shared by all locales), and this space can't enable field-level i18n (plan
// cap). So tag DISPLAY labels are localized here instead: content/tag-
// translations.json maps each English tag → its per-locale label. Tags are
// display-only (PostMeta chips + og:article:tag), so only the label changes;
// the English tag stays canonical.
//
// - loadTagMap / localizeTags are PURE (used by the build; no API key needed).
// - ensureTagTranslations fills missing labels via Claude and persists the map;
//   it runs at AUTHORING time (scripts/new-post.mjs), so the build just reads a
//   committed, human-editable map. Missing entries fall back to the English tag.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hasAnthropicKey, resolveAnthropicKey } from "./llm-postedit.mjs";

const MODEL = "claude-opus-4-8";
const LOCALE_NAME = { de: "German", es: "Argentine Spanish", fr: "French", it: "Italian", pt: "European Portuguese" };

export function loadTagMap(path) {
  // Absent is the fresh-checkout case and means "nothing translated yet".
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // A file that EXISTS but does not parse is a different thing from an absent
    // one, and treating it as
    // empty is destructive rather than merely wrong: every tag then looks
    // untranslated, ensureTagTranslations refills the map, and saveTagMap writes
    // that over the real file. 14 tags x 5 locales of reviewed labels, gone, with
    // a green build. Exactly the failure the approvals manifest had before
    // blog-gate.mjs stopped conflating the two.
    throw new Error(
      `tag-i18n: ${path} exists but is not valid JSON (${e.message}). ` +
        "Refusing to treat it as empty: that would overwrite every existing tag " +
        "translation on the next save. Restore it from git.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `tag-i18n: ${path} must contain a JSON object, got ${Array.isArray(parsed) ? "an array" : typeof parsed}.`,
    );
  }
  return parsed;
}

export function saveTagMap(path, map) {
  const sorted = {};
  for (const k of Object.keys(map).sort((a, b) => a.localeCompare(b))) sorted[k] = map[k];
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

/** English tag_list → localized labels for `locale` (unmapped tags stay English). */
export function localizeTags(tagList, locale, map) {
  return (tagList ?? []).map((t) => map[t]?.[locale] || t);
}

/** Tags with no label for `locale` in the map (would fall back to English). */
export function unmappedTags(tagList, locale, map) {
  return (tagList ?? []).filter((t) => !map[t]?.[locale]);
}

// Claude: translate short CATEGORY TAGS into one locale, keeping English
// loanwords where natural. Returns { enTag: translated }. {} with no key/SDK.
async function translateTagsClaude(tags, locale) {
  if (!hasAnthropicKey() || !tags.length || !LOCALE_NAME[locale]) return {};
  let Anthropic;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch {
    return {};
  }
  const system = [
    `Translate short blog CATEGORY TAGS into ${LOCALE_NAME[locale]}, as a native reader would label blog categories.`,
    "KEEP established English tech / leadership / coaching loanwords in English where that is the natural convention in the target language (e.g. Leadership, Coaching, DevOps, SRE, Incident Response); translate the rest naturally.",
    "Title Case. No quotation marks, no explanations, no trailing punctuation.",
  ].join(" ");
  try {
    const client = new Anthropic({ apiKey: resolveAnthropicKey() });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: { tag: { type: "string" }, translation: { type: "string" } },
                  required: ["tag", "translation"],
                  additionalProperties: false,
                },
              },
            },
            required: ["items"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user", content: `Tags:\n${tags.join("\n")}` }],
    });
    if (res.stop_reason === "refusal") return {};
    const out = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(out);
    const m = {};
    for (const it of parsed?.items ?? []) if (it?.tag && it?.translation) m[it.tag] = String(it.translation).trim();
    return m;
  } catch (err) {
    console.warn(`  tag translation (${locale}): skipped (${err?.message ?? err}).`);
    return {};
  }
}

/**
 * Ensure every tag in `tags` has a label for every locale in `locales`,
 * translating the missing ones via Claude and persisting the map at `path`.
 * Missing translations fall back to the English tag. Returns the count added.
 */
export async function ensureTagTranslations(tags, locales, path) {
  const map = loadTagMap(path);
  let added = 0;
  let unresolved = 0;
  for (const loc of locales) {
    const missing = tags.filter((t) => !map[t]?.[loc]);
    if (!missing.length) continue;
    const translated = await translateTagsClaude(missing, loc);
    for (const t of missing) {
      // Persist ONLY a real translation.
      //
      // This used to write `translated[t] || t`, i.e. the English tag itself
      // whenever Claude produced nothing: no API key, SDK not installed, a
      // refusal, a rate limit, any thrown error. All of those return {}.
      //
      // The damage was permanent, not transient: the `missing` filter above tests
      // whether a value EXISTS, so an English placeholder is indistinguishable
      // from a finished translation and is never retried. One keyless build
      // pinned every tag to English in all five locales, for good.
      //
      // Leaving it unmapped is not a regression in what readers see, because
      // localizeTags already falls back to the English tag for anything absent;
      // it just keeps the work outstanding so the next build with a key does it.
      if (!translated[t]) {
        unresolved += 1;
        continue;
      }
      map[t] = map[t] || {};
      map[t][loc] = translated[t];
      added += 1;
    }
  }
  if (unresolved) {
    console.warn(
      `  tag translation: ${unresolved} (tag, locale) pair(s) left untranslated. ` +
        "They render as the English tag and will be retried on the next build.",
    );
  }
  if (added) saveTagMap(path, map);
  return added;
}

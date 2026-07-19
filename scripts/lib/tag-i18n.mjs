// scripts/lib/tag-i18n.mjs — localized labels for the global Storyblok tag_list.
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

import { readFileSync, writeFileSync } from "node:fs";
import { hasAnthropicKey, resolveAnthropicKey } from "./llm-postedit.mjs";

const MODEL = "claude-opus-4-8";
const LOCALE_NAME = { de: "German", es: "Argentine Spanish", fr: "French", it: "Italian", pt: "European Portuguese" };

export function loadTagMap(path) {
  try {
    const m = JSON.parse(readFileSync(path, "utf8"));
    return m && typeof m === "object" ? m : {};
  } catch {
    return {};
  }
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
  for (const loc of locales) {
    const missing = tags.filter((t) => !map[t]?.[loc]);
    if (!missing.length) continue;
    const translated = await translateTagsClaude(missing, loc);
    for (const t of missing) {
      map[t] = map[t] || {};
      map[t][loc] = translated[t] || t;
      added += 1;
    }
  }
  if (added) saveTagMap(path, map);
  return added;
}

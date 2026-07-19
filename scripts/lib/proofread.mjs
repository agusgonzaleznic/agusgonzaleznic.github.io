// scripts/lib/proofread.mjs — authoring-time source checks (English especially),
// run BEFORE a post reaches Storyblok / the DeepL+Claude translation pass, so a
// source typo can't corrupt six machine translations. Two independent checks:
//
//   proofread(text)            — Claude finds objective errors only (never style,
//                                voice, or profanity). Degrades to {ran:false} with
//                                no ANTHROPIC_API_KEY / SDK, so the caller keeps
//                                working. Reuses the key resolver from llm-postedit.
//   glossaryCandidates(text,…) — keyless heuristic: surfaces ALLCAPS acronyms and
//                                CamelCase/product tokens NOT already in the
//                                do-not-translate glossary, to add before translating.
//
// Never throws; the importer treats results as advisory.

import { hasAnthropicKey, resolveAnthropicKey } from "./llm-postedit.mjs";

// Proofreading is a well-scoped copy-edit, not deep reasoning — same model the
// post-edit pass uses; volume is one post at a time, so cost is trivial.
const MODEL = "claude-opus-4-8";

export { hasAnthropicKey };

/**
 * Proofread English source prose. Returns { ran, issues } where issues is
 * [{ original, suggestion, reason }]. `original` is copied verbatim from the
 * input so the caller can locate/replace it. Returns { ran:false } (no pass) when
 * there's no key/SDK or empty text; never throws.
 */
export async function proofread(text) {
  if (!hasAnthropicKey() || !text.trim()) return { ran: false, issues: [] };
  let Anthropic;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch {
    return { ran: false, issues: [] };
  }
  const system = [
    "You are a meticulous copy editor proofreading English text BEFORE it is machine-translated into other languages.",
    "Report ONLY objective errors: misspellings, typos, doubled words, subject–verb/agreement errors, wrong or missing punctuation, and clear grammar mistakes.",
    "Do NOT report style, tone, concision, or word-choice preferences. Do NOT flag profanity, slang, dialect, or intentional informal usage. Do NOT rewrite sentences.",
    "Preserve the author's voice. When unsure whether something is an error or a deliberate choice, leave it out — false positives are worse than misses here.",
    "For each error, return the exact substring to replace as `original` (copied verbatim, long enough to be unique in the text), the corrected `suggestion`, and a short `reason`.",
  ].join(" ");
  try {
    const client = new Anthropic({ apiKey: resolveAnthropicKey() });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    original: { type: "string" },
                    suggestion: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["original", "suggestion", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["issues"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user", content: `Proofread the following text:\n\n${text}` }],
    });
    if (res.stop_reason === "refusal") return { ran: true, issues: [] };
    const out = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(out);
    return { ran: true, issues: Array.isArray(parsed?.issues) ? parsed.issues : [] };
  } catch (err) {
    console.warn(`  proofread: skipped (${err?.message ?? err}).`);
    return { ran: false, issues: [] };
  }
}

/**
 * Suggest 4-6 language-agnostic topic tags for a post, preferring to reuse the
 * tags already in use (passed as `existing`) so the taxonomy stays consistent.
 * Returns [] with no key/SDK; never throws.
 */
export async function suggestTags(text, existing = []) {
  if (!hasAnthropicKey() || !text.trim()) return [];
  let Anthropic;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch {
    return [];
  }
  const system = [
    "You suggest topic tags for a blog post about engineering leadership and coaching.",
    "Return 4-6 concise, reusable tags in Title Case (e.g. \"Engineering Management\", \"Incident Response\", \"Psychological Safety\").",
    "STRONGLY prefer reusing an existing tag verbatim when it fits, rather than inventing a near-duplicate.",
    "Tags are language-agnostic categories kept in English. No hashtags, no punctuation.",
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
            properties: { tags: { type: "array", items: { type: "string" } } },
            required: ["tags"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "user",
          content: `Existing tags to reuse where they fit: ${existing.join(", ") || "(none yet)"}\n\nPost:\n${text.slice(0, 6000)}`,
        },
      ],
    });
    if (res.stop_reason === "refusal") return [];
    const out = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(out);
    return Array.isArray(parsed?.tags) ? parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6) : [];
  } catch (err) {
    console.warn(`  tag suggestion: skipped (${err?.message ?? err}).`);
    return [];
  }
}

// Common all-caps English words that are never do-not-translate terms — filtered
// out of candidates to cut noise. (Real terms like SRE/SEV-1/TTL are NOT here.)
const STOP_CAPS = new Set(["STOP", "ASAP", "NOW", "OK", "OKAY", "YES", "NO", "TLDR", "FYI", "AKA", "ETA", "DIY"]);

/**
 * Heuristic do-not-translate candidates present in `text` but missing from
 * `existingTerms`: ALLCAPS acronyms (incl. hyphen/number forms like SEV-1) and
 * CamelCase/product tokens (GitOps). Advisory — the caller confirms each.
 */
export function glossaryCandidates(text, existingTerms) {
  const have = new Set(existingTerms);
  const found = new Set();
  for (const m of text.matchAll(/\b[A-Z]{2,}(?:[-‑ ]?\d+)?\b/g)) found.add(m[0]);
  for (const m of text.matchAll(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g)) found.add(m[0]);
  return [...found]
    .filter((t) => !have.has(t) && !STOP_CAPS.has(t.replace(/[-‑ ]?\d+$/, "")))
    .sort();
}

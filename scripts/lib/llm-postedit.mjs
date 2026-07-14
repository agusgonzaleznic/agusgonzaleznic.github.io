// Build-time LLM post-edit of DeepL machine translation for the i18n pipeline.
//
// WHAT: DeepL produces fluent-but-literal MT. This module runs a second pass with
// Claude that fixes register (German Sie, never du), first-person gender
// agreement (the author writes in the first person, masculine), false friends
// ("DevOps Lead" must never become "DevOps Blei" — Blei = the metal), and keeps
// coaching/tech loanwords and brand names in English — turning raw MT into copy a
// native reader wouldn't flag as machine-translated.
//
// WHERE IT PLUGS IN: createTranslator({ postEditor, cacheSalt }) in deepl.mjs. On
// a cache MISS, DeepL translates, then postEditBatch() refines, and the refined
// string is what gets cached. Cache HITS — including reviewed .po strings adopted
// via seedCache — never reach Claude. The cache key is salted with
// POSTEDIT_VERSION so post-edited entries live at distinct keys from raw-DeepL
// ones: turning the key on later produces post-edited output automatically, and a
// keyless build stays byte-identical to a DeepL-only build.
//
// SECURITY: the key is read ONLY from process.env.ANTHROPIC_API_KEY — a NON-VITE,
// build-time-only var. Never logged, never reaches src/ or the client bundle.
// This repo is public — keep it that way.
//
// FAIL-SAFE: three independent guards, each degrading to raw DeepL, never
// throwing, so a Claude outage/refusal can neither break a deploy nor corrupt
// ICU/markup:
//   1. No ANTHROPIC_API_KEY               → createPostEditor() returns null (no pass).
//   2. SDK missing / API error / refusal / bad or short JSON → that batch keeps
//      its DeepL MT.
//   3. A candidate that drops or mangles a {placeholder}, <tag>, URL or email
//      → that STRING keeps its DeepL MT (per-string, so one bad string can't
//      poison the batch).

// Bump when the prompt, model, or recipe changes so the salted cache regenerates
// post-edited entries on the next keyed build instead of serving stale ones.
// pe2: register switched to informal German (du) + Argentine voseo Spanish.
export const POSTEDIT_VERSION = "pe2";

// Post-editing is a well-scoped rewrite, not deep reasoning — the widely-used
// default model, no extended thinking. Volume here is tiny (a handful of blog
// posts + occasional catalog changes), so cost is negligible; change this one
// constant to trade quality for cost.
const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 8192;
const MAX_ITEMS_PER_CALL = 20; // source+MT pairs per request; keeps alignment tight
const MAX_CHARS_PER_CALL = 4000; // and bounds output well under MAX_TOKENS

const LOCALE_NAME = {
  de: "German",
  es: "Argentine Spanish",
  fr: "French",
  it: "Italian",
  pt: "European Portuguese",
};

// Per-locale register notes layered on top of the universal rules below.
const REGISTER_RULES = {
  de: [
    "Address the reader INFORMALLY with du / dein / dir / dich — never the formal Sie / Ihr. This is a modern Berlin tech voice: warm, direct, peer-to-peer, the way engineers actually talk to each other.",
    "Keep it concise and don't over-expand: German runs ~30% longer than English, so prefer the tightest natural phrasing (UI labels/buttons must not overflow) and keep source abbreviations — 'orgs' stays 'Orgs', not 'Organisationen'.",
    "Beware false friends and calques: a \"DevOps Lead\" is a role — never \"DevOps Blei\" (Blei is the metal).",
  ],
  es: [
    "Use Argentine Spanish with VOSEO: address the reader as 'vos' and use vos verb forms (dirigí, tenés, podés, sabés, sos, contás) — never tú- or usted-forms (not 'dirige', 'dirija', 'tienes', 'usted', 'su equipo' → use 'tu equipo').",
    "Warm and informal-professional, like an experienced peer talking shop — not a corporate brochure.",
    "Keep natural abbreviations from the source: 'orgs' → 'orgs' (or 'org'), not 'organizaciones'.",
  ],
  fr: [
    "Address the reader INFORMALLY with 'tu' (tu/ton/tes) — never the formal 'vous'. Warm, direct, peer-to-peer. For commands/CTAs use the 'tu' IMPERATIVE (Dirige, Lis, Découvre, Réserve), NEVER the infinitive (not 'Diriger', 'Lire', 'Découvrir').",
    "Keep source abbreviations ('orgs') and English tech/coaching loanwords intact.",
  ],
  it: [
    "Address the reader INFORMALLY with 'tu' — never the formal 'Lei'. Warm, direct, peer-to-peer.",
    "Keep source abbreviations ('orgs') and English tech/coaching loanwords intact.",
  ],
  pt: [
    "Use European Portuguese and address the reader INFORMALLY with 'tu' — never the formal 'o senhor / a senhora'. Warm, direct, peer-to-peer.",
    "Keep source abbreviations ('orgs') and English tech/coaching loanwords intact.",
  ],
};

export function resolveAnthropicKey() {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim();
}

export function hasAnthropicKey() {
  return resolveAnthropicKey().length > 0;
}

// Structural spans that MUST survive translation byte-for-byte: ICU/interpolation
// braces, HTML/Lingui component tags, URLs and emails. If a candidate's multiset
// of these differs from the source, the post-edit is rejected for that string.
function protectedTokens(text) {
  const tokens = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) tokens.push(text.slice(start, i + 1));
    }
  }
  const patterns = [
    /<[^>]+>/g,
    /\bhttps?:\/\/[^\s<>{}"']+/g,
    /\bwww\.[^\s<>{}"']+/g,
    /[^\s<>{}"'()@]+@[^\s<>{}"'()@]+\.[A-Za-z]{2,}/g,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) tokens.push(m[0]);
  return tokens.sort();
}

function placeholdersPreserved(source, candidate) {
  const a = protectedTokens(source);
  const b = protectedTokens(candidate);
  if (a.length !== b.length) return false;
  return a.every((t, i) => t === b[i]);
}

function buildSystemPrompt(locale, glossaryTerms) {
  const rules = [
    `You are a professional ${LOCALE_NAME[locale]} translator post-editing machine translation for a senior engineering-leadership coach's personal website.`,
    "For each item you get the English source (EN) and a machine translation (MT). Return a corrected, native-quality translation of the EN — faithful in meaning, no additions or omissions — that reads as if written by a native professional, not translated.",
    "The author writes in the first person and is male: use masculine gender agreement for any first-person self-reference.",
    "Keep brand names, product names, and established English tech/coaching terms in English, with their exact casing (e.g. Leadership, Coaching, DevOps, DORA, GitOps, FinOps, Web3).",
    "Preserve EXACTLY, byte-for-byte and in place: every {placeholder} or {plural, ...} ICU expression, every <0>…</0> / <tag> markup element, every URL, and every email address. Never translate, reorder, renumber, or alter them.",
    "Preserve the source's leading/trailing whitespace and punctuation shape.",
    "VOICE: warm, direct, confident, peer-to-peer — an experienced engineering leader talking shop with a colleague, never a corporate brochure or a stiff literal rendering; prefer the tightest natural phrasing.",
    'IMPERATIVE MOOD: when the English is a command / call-to-action (headlines and buttons like "Lead an Engineering Org…", "Book a Session", "Read the original"), render it as the target language\'s SECOND-PERSON INFORMAL IMPERATIVE — never the infinitive, a gerund/nominalization, or a formal form. E.g. "Lead" → fr "Dirige" (NOT the infinitive "Diriger"), es voseo "Dirigí", de "Führe", it "Guida", pt "Lidera"; "Read" → fr "Lis", es "Leé", de "Lies", it "Leggi", pt "Lê".',
    ...(REGISTER_RULES[locale] ?? []),
  ];
  if (glossaryTerms.length) {
    rules.push(
      `Never translate these terms — reproduce them verbatim wherever they appear: ${glossaryTerms.join(", ")}.`,
    );
  }
  return rules.join("\n");
}

// Group items into calls bounded by count AND cumulative source length so a batch
// of long blog paragraphs can't blow past MAX_TOKENS on output.
function chunkItems(items) {
  const chunks = [];
  let cur = [];
  let chars = 0;
  for (const it of items) {
    const len = (it.source?.length ?? 0) + (it.mt?.length ?? 0);
    if (cur.length && (cur.length >= MAX_ITEMS_PER_CALL || chars + len > MAX_CHARS_PER_CALL)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(it);
    chars += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

async function callClaude(client, chunk, locale, glossaryTerms) {
  // Per-item ids (not positional order): the model occasionally splits or merges
  // an item, so a length- or order-based mapping would mis-align or (worse) drop
  // the whole batch. Echoing an explicit id lets us map each result back exactly
  // and keep raw DeepL only for the specific ids the model didn't return.
  const user =
    `Post-edit each item into natural, native-quality ${LOCALE_NAME[locale]}. ` +
    "Return one object per item in `items`, echoing the item's numeric `id` and its corrected translation as `text`. " +
    "Return every id you were given exactly once; do not split, merge, renumber, or reorder items.\n\n" +
    chunk.map((it) => `id ${it.idx}\nEN: ${it.source}\nMT: ${it.mt}`).join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(locale, glossaryTerms),
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
                properties: { id: { type: "integer" }, text: { type: "string" } },
                required: ["id", "text"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    },
    messages: [{ role: "user", content: user }],
  });

  // Guard the refusal stop reason before reading content (content is empty on a
  // pre-output refusal). A refusal on marketing/blog copy is unexpected; treat it
  // like any other failure and keep the MT.
  if (response.stop_reason === "refusal") throw new Error("model refused");

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = JSON.parse(text); // structured output guarantees valid JSON shape
  const byId = new Map();
  for (const o of Array.isArray(parsed?.items) ? parsed.items : []) {
    if (o && Number.isInteger(o.id) && typeof o.text === "string") byId.set(o.id, o.text);
  }
  return byId; // id -> corrected text; ids the model omitted are simply absent
}

/**
 * Create a post-editor bound to an Anthropic key and the do-not-translate
 * glossary. postEditBatch(items, locale) takes [{ source, mt }] and returns the
 * final strings in order — post-edited where safe, raw MT everywhere a guard
 * fires. Never throws.
 */
export function createPostEditor({ apiKey, glossaryTerms = [] }) {
  const stats = { postEdited: 0, keptMt: 0, calls: 0, failures: 0 };
  let clientPromise = null;

  // Lazy, cached, failure-tolerant SDK load: a missing @anthropic-ai/sdk (e.g. a
  // build env that never installed it) degrades to raw DeepL instead of crashing.
  async function getClient() {
    if (!clientPromise) {
      clientPromise = import("@anthropic-ai/sdk")
        .then((m) => new m.default({ apiKey }))
        .catch((err) => {
          console.warn(
            `  i18n post-edit: @anthropic-ai/sdk unavailable (${err?.message ?? err}); using raw DeepL.`,
          );
          return null;
        });
    }
    return clientPromise;
  }

  async function postEditBatch(items, locale) {
    if (!items.length) return [];
    if (!LOCALE_NAME[locale]) return items.map((it) => it.mt);
    const client = await getClient();
    if (!client) return items.map((it) => it.mt);

    const out = items.map((it) => it.mt); // default: keep MT

    for (const chunk of chunkItems(items.map((it, i) => ({ ...it, idx: i })))) {
      stats.calls += 1;
      let byId;
      try {
        byId = await callClaude(client, chunk, locale, glossaryTerms);
      } catch (err) {
        stats.failures += 1;
        console.warn(
          `  i18n post-edit (${locale}): call failed (${err?.message ?? err}); ` +
            `keeping raw DeepL for ${chunk.length} string(s).`,
        );
        continue;
      }
      // Map each result back by id. A missing id or a mangled placeholder keeps
      // raw DeepL for THAT string only — never the whole batch.
      for (const it of chunk) {
        const cand = byId.get(it.idx);
        if (typeof cand === "string" && cand.trim() && placeholdersPreserved(it.source, cand)) {
          out[it.idx] = cand;
          stats.postEdited += 1;
        } else {
          stats.keptMt += 1;
        }
      }
    }
    return out;
  }

  return { stats, postEditBatch };
}

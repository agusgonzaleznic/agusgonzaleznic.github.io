// Build-time machine translation of the Lingui PO catalogs.
//
//   node scripts/translate.mjs            (npm run i18n:translate — see final note)
//
// Reads the source catalog src/i18n/catalogs/en.po and, for every target locale
// (de, es, fr, it, pt), writes src/i18n/catalogs/<locale>.po with each message
// translated via the DeepL API Free. This produces RAW machine translation only.
//
//   ┌─ PIPELINE ORDER ──────────────────────────────────────────────────────┐
//   │ 1. lingui extract         → src/i18n/catalogs/en.po (source msgids)    │
//   │ 2. node scripts/translate.mjs (THIS)  → raw MT <locale>.po             │
//   │ 3. LLM post-edit  (run later by the orchestrator)                      │
//   │ 4. Native-speaker review                                              │
//   │ 5. Mark the locale reviewed → add it to PUBLISHED_LOCALES in           │
//   │    src/i18n/locales.ts. A locale is PUBLISHED only after 3–5.          │
//   └───────────────────────────────────────────────────────────────────────┘
//
// KEYLESS (this phase): with no DEEPL_API_KEY set, this is a clean no-op — it
// prints a notice and exits 0, leaving the catalogs untranslated. Deploys run
// keyless until the secret exists, so the site stays English-only and unchanged.
//
// SECURITY: DEEPL_API_KEY is a NON-VITE, build-time-only var read via deepl.mjs.
// It never reaches src/ or the client bundle. Repo is public.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTranslator,
  hasApiKey,
  loadCache,
  loadGlossary,
  loadGlossaryTerms,
  saveCache,
  seedCache,
  SOURCE_LOCALE,
  TARGET_LOCALES,
} from "./lib/deepl.mjs";
import { createPostEditor, hasAnthropicKey, POSTEDIT_VERSION } from "./lib/llm-postedit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const catalogDir = resolve(projectRoot, "src/i18n/catalogs");
const sourcePo = resolve(catalogDir, `${SOURCE_LOCALE}.po`);
const cachePath = resolve(__dirname, ".i18n-cache.json");
const glossaryPath = resolve(__dirname, "i18n-glossary.json");

// ---- Minimal PO parse / serialize (self-contained, no deps) -----------------
// Handles comments, msgctxt, multi-line strings and C-style escaping — enough
// for Lingui's `po` format. We only ever WRITE the target <locale>.po files;
// en.po (owned by i18n-core) is read-only here.

const unescapePo = (s) =>
  s.replace(/\\(.)/g, (_, c) =>
    c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c,
  );
const escapePo = (s) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
const parseQuoted = (line) => {
  const m = line.match(/^"((?:[^"\\]|\\.)*)"\s*$/);
  return m ? unescapePo(m[1]) : "";
};
const quote = (s) => `"${escapePo(s)}"`;

function parsePo(text) {
  const entries = [];
  let cur = null;
  let field = null;
  const flush = () => {
    if (cur) entries.push(cur);
    cur = null;
    field = null;
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    cur ??= { comments: [], msgctxt: null, msgid: "", msgstr: "" };
    if (line.startsWith("#")) {
      cur.comments.push(line);
      field = null;
    } else if (line.startsWith("msgctxt ")) {
      cur.msgctxt = parseQuoted(line.slice(8));
      field = "msgctxt";
    } else if (line.startsWith("msgid ")) {
      cur.msgid = parseQuoted(line.slice(6));
      field = "msgid";
    } else if (line.startsWith("msgstr ")) {
      cur.msgstr = parseQuoted(line.slice(7));
      field = "msgstr";
    } else if (line.trimStart().startsWith('"')) {
      const val = parseQuoted(line.trim());
      if (field === "msgctxt") cur.msgctxt = (cur.msgctxt ?? "") + val;
      else if (field === "msgid") cur.msgid += val;
      else if (field === "msgstr") cur.msgstr += val;
    }
  }
  flush();
  return entries;
}

function serializePo(entries) {
  return `${entries
    .map((e) => {
      const out = [...e.comments];
      if (e.msgctxt != null) out.push(`msgctxt ${quote(e.msgctxt)}`);
      out.push(`msgid ${quote(e.msgid)}`);
      out.push(`msgstr ${quote(e.msgstr)}`);
      return out.join("\n");
    })
    .join("\n\n")}\n`;
}

const entryKey = (e) => `${e.msgctxt ?? ""}${e.msgid}`;
// English source text: the reviewed msgstr if the source catalog carries one
// (explicit-id layout), otherwise the msgid itself (default layout).
const sourceText = (e) => (e.msgstr && e.msgstr.trim() ? e.msgstr : e.msgid);
const isHeader = (e) => e.msgid === "" && e.msgctxt == null;

function setLanguageHeader(headerMsgstr, locale) {
  if (/^Language:.*$/m.test(headerMsgstr)) {
    return headerMsgstr.replace(/^Language:.*$/m, `Language: ${locale}`);
  }
  return `${headerMsgstr}${headerMsgstr.endsWith("\n") || headerMsgstr === "" ? "" : "\n"}Language: ${locale}\n`;
}

// ---- Main -------------------------------------------------------------------

async function main() {
  if (!hasApiKey()) {
    console.log(
      "\ni18n:translate — DEEPL_API_KEY not set. No-op: catalogs left untranslated (English-only).\n" +
        "  This is expected for this phase; set DEEPL_API_KEY (DeepL API Free) to generate raw\n" +
        "  machine translations, then run LLM post-edit + native review before publishing a locale.\n",
    );
    return;
  }
  if (!existsSync(sourcePo)) {
    console.log(
      `\ni18n:translate — source catalog not found at ${sourcePo}.\n` +
        "  Run `lingui extract` first (owned by the i18n-core setup). No-op.\n",
    );
    return;
  }

  const enEntries = parsePo(readFileSync(sourcePo, "utf8"));
  const header = enEntries.find(isHeader) ?? null;
  const messages = enEntries.filter((e) => !isHeader(e) && e.msgid !== "");

  const cache = loadCache(cachePath);
  const glossaryRegex = loadGlossary(glossaryPath);
  // Optional LLM post-edit pass: refines raw DeepL into native-quality copy when
  // ANTHROPIC_API_KEY is set. Keyless → null → raw DeepL only (unchanged behaviour).
  const postEditor = hasAnthropicKey()
    ? createPostEditor({ apiKey: process.env.ANTHROPIC_API_KEY.trim(), glossaryTerms: loadGlossaryTerms(glossaryPath) })
    : null;
  const cacheSalt = postEditor ? POSTEDIT_VERSION : "";
  const translator = createTranslator({
    apiKey: process.env.DEEPL_API_KEY.trim(),
    glossaryRegex,
    cache,
    postEditor,
    cacheSalt,
  });

  for (const locale of TARGET_LOCALES) {
    const targetPo = resolve(catalogDir, `${locale}.po`);

    // Adopt any existing reviewed/edited translations into the cache (keyed to
    // the CURRENT English source hash) so we neither clobber them nor re-spend
    // API calls. If the English later changes, its hash changes and the stale
    // entry misses the cache → it is retranslated.
    if (existsSync(targetPo)) {
      const prev = new Map(
        parsePo(readFileSync(targetPo, "utf8"))
          .filter((e) => e.msgid !== "" && e.msgstr && e.msgstr.trim())
          .map((e) => [entryKey(e), e.msgstr]),
      );
      for (const e of messages) {
        const existing = prev.get(entryKey(e));
        if (existing) seedCache(cache, locale, sourceText(e), existing, cacheSalt);
      }
    }

    const translations = await translator.translateAll(messages.map(sourceText), locale);

    const outEntries = [];
    if (header) {
      outEntries.push({ ...header, comments: [...header.comments], msgstr: setLanguageHeader(header.msgstr, locale) });
    }
    messages.forEach((e, i) => {
      outEntries.push({ comments: [...e.comments], msgctxt: e.msgctxt, msgid: e.msgid, msgstr: translations[i] });
    });

    writeFileSync(targetPo, serializePo(outEntries));
    console.log(`✓ i18n:translate ${locale}: ${messages.length} message(s) → src/i18n/catalogs/${locale}.po`);
  }

  saveCache(cachePath, cache);
  const { cacheHits, translated, apiCalls } = translator.stats;
  const pe = postEditor
    ? ` LLM post-edit: ${postEditor.stats.postEdited} refined, ${postEditor.stats.keptMt} kept as raw DeepL` +
      `${postEditor.stats.failures ? `, ${postEditor.stats.failures} call(s) failed` : ""}.`
    : " LLM post-edit: skipped (ANTHROPIC_API_KEY not set).";
  console.log(
    `✓ i18n:translate done — ${translated} translated, ${cacheHits} from cache, ${apiCalls} DeepL call(s).${pe} ` +
      "Next: native review, then add the locale to PUBLISHED_LOCALES.",
  );
}

main().catch((err) => {
  console.error(`i18n:translate: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});

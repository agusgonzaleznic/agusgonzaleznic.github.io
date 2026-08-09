// Minimal gettext .po parse/serialize for the unified copy-review tool
// (scripts/review-translations.mjs) to read/write Lingui catalogs. Handles
// comments, msgctxt, multi-line strings, and C-style escaping — enough for
// Lingui's `po` format.
//
// NOTE: scripts/translate.mjs keeps its OWN byte-identical inline copy of this
// parser (it can't be imported here — it runs main() on import). The two MUST
// stay in sync so a .po written by the translator and one saved from the review
// UI serialize identically (no reformat churn / spurious diffs). If you change
// serialization here, mirror it in translate.mjs, and vice-versa.

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

export function parsePo(text) {
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

export function serializePo(entries) {
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

export const entryKey = (e) => `${e.msgctxt ?? ""}${e.msgid}`;
/** English source text: the reviewed msgstr if the source catalog carries one, else the msgid. */
export const sourceText = (e) => (e.msgstr && e.msgstr.trim() ? e.msgstr : e.msgid);
export const isHeader = (e) => e.msgid === "" && e.msgctxt == null;

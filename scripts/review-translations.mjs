// scripts/review-translations.mjs — ONE local tool to review ALL site copy.
//
// A single local web app to read English side-by-side with each translation,
// edit in context, and Save — covering the three places copy lives:
//   • pages — Storyblok marketing pages (/about, /services, …), grouped by page.
//   • blog  — Storyblok blog posts, grouped by post.
//   • ui    — Lingui UI/chrome strings (.po catalogs), grouped by source file.
//
// LANGUAGES: English is the source (left column). By default you review only the
// two languages you actually speak — Argentinian Spanish (es) and German (de).
// French/Italian/Portuguese stay machine-translated and are never shown unless
// you pass --all. A locale selector in the header filters the view live.
//
// REVIEW-LOCK: Save writes the reviewed copy to the repo AND stamps an approval
// with a sourceHash, so the build serves it VERBATIM and the GitHub Actions
// machine translation never overwrites it (editing the English later changes the
// hash → the item re-opens for review). This is enforced in the build gates:
//   • pages → content/pages/<slug>.<locale>.json + content/page-approvals.json
//             (scripts/lib/page-gate.mjs, consumed by scripts/fetch-pages.mjs)
//   • blog  → content/translations/<uuid>.<locale>.json + content/i18n-approvals.json
//             (scripts/lib/blog-gate.mjs, consumed by scripts/fetch-blog.mjs)
//   • ui    → the reviewed msgstr is written straight into src/i18n/catalogs/<locale>.po,
//             which the build imports directly (scripts/translate.mjs is NOT in CI,
//             so committed .po files are already safe from the automation).
//
// Run:
//   op run --env-file="$HOME/.env" --no-masking -- node scripts/review-translations.mjs
//   ... --domain pages|blog|ui   review one domain (default: all three)
//   ... --locale es|de           review one language (default: es + de)
//   ... --all                    include fr/it/pt too
//   ... --post <slug>            just one blog article
//   ... --port <n>               (default 4477)
//
// Then commit the changes yourself (signed): git add content/ src/i18n/catalogs/ && git commit -S

import { createServer } from "node:http";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTranslator, hasApiKey, loadCache, saveCache, loadGlossary, loadGlossaryTerms,
} from "./lib/deepl.mjs";
import { createPostEditor, hasAnthropicKey, POSTEDIT_VERSION } from "./lib/llm-postedit.mjs";
import { translateStories } from "./lib/richtext-translate.mjs";
import { fetchPublishedPosts, fetchStoriesByPrefix } from "./lib/storyblok-fetch.mjs";
import { REVIEW_GATED_LOCALES, AUTO_LOCALES, enSourceHash, loadApprovals } from "./lib/blog-gate.mjs";
import {
  pageSlug, pageSourceHash, loadPageApprovals, loadReviewedPage, reviewedPagePath,
} from "./lib/page-gate.mjs";
import { translatePage } from "./lib/page-translate.mjs";
import { parsePo, serializePo, entryKey, sourceText, isHeader } from "./lib/po.mjs";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const reviewedDir = resolve(__dirname, "../content/translations");
const approvalsPath = resolve(__dirname, "../content/i18n-approvals.json");
const contentPagesDir = resolve(__dirname, "../content/pages");
const pageApprovalsPath = resolve(__dirname, "../content/page-approvals.json");
const catalogDir = resolve(__dirname, "../src/i18n/catalogs");
const generatedDir = resolve(__dirname, "../src/generated");
const cachePath = resolve(__dirname, ".i18n-cache.json");
const glossaryPath = resolve(__dirname, "i18n-glossary.json");

const LOCALE_NAME = { es: "Español (Argentina)", de: "Deutsch", fr: "Français", it: "Italiano", pt: "Português" };
const BLOG_FIELDS = ["title", "excerpt", "seo_title", "seo_description"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const port = Number(opt("--port", "4477"));
const onlyPost = opt("--post", null);
const onlyDomain = opt("--domain", null); // pages | blog | ui | null(all)
const onlyLocale = opt("--locale", null); // es | de | null(all reviewed)
// The languages the owner reviews. en is the source; es+de by default (--all adds fr/it/pt).
let locales = flag("--all") ? [...REVIEW_GATED_LOCALES, ...AUTO_LOCALES] : [...REVIEW_GATED_LOCALES];
if (onlyLocale) locales = locales.filter((l) => l === onlyLocale);

const fatal = (m) => { console.error(`review-translations: ${m}`); process.exit(1); };
const wantDomain = (d) => !onlyDomain || onlyDomain === d;

const token = process.env.STORYBLOK_PUBLIC_TOKEN;
if (!token) fatal("STORYBLOK_PUBLIC_TOKEN is required (run under `op run`).");

// Translator is lazy: only built if we actually machine-translate a missing pair.
let translator = null;
let cacheObj = null;
function getTranslator() {
  if (translator) return translator;
  if (!hasApiKey()) return null;
  cacheObj = loadCache(cachePath);
  translator = createTranslator({
    apiKey: process.env.DEEPL_API_KEY.trim(),
    glossaryRegex: loadGlossary(glossaryPath),
    cache: cacheObj,
    postEditor: hasAnthropicKey()
      ? createPostEditor({ apiKey: process.env.ANTHROPIC_API_KEY.trim(), glossaryTerms: loadGlossaryTerms(glossaryPath) })
      : null,
    cacheSalt: hasAnthropicKey() ? POSTEDIT_VERSION : "",
  });
  return translator;
}

// ── shared helpers ───────────────────────────────────────────────────────────
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const statusOf = (approved, fresh, hasReview) =>
  approved && fresh ? "approved" : approved ? "stale" : hasReview ? "pending" : "new";

// ── PAGES ────────────────────────────────────────────────────────────────────
// Ordered translatable slots of a page, one per writable string field: the same
// walk the translator + hash use (mirrors page-translate.collect), plus a stable
// `id` per slot so a target tree can be aligned to it by NAME rather than by
// position (see pageDisplaySlots). De-dup by English string for display (a
// repeated string is reviewed once; the edit applies to every occurrence).
const PAGE_NON_TEXT = new Set([
  "component", "_uid", "_editable", "slug", "full_slug", "uuid", "id",
  "icon", "color", "value", "period", "company", "featured", "is_highlighted",
  "show_section", "background_style", "industries",
  "url", "cta_url", "secondary_cta_url", "href", "image", "og_image", "filename",
]);
// Path segment for one array element. A block is named by its `component` plus
// its ordinal among siblings of that SAME component, never by its raw index, so
// inserting one block type does not renumber the others: adding a `cta_block`
// between two `about_block`s leaves both `about_block#n` ids untouched. Elements
// that are not blocks (a plain string in an array) fall back to the index.
function slotSegment(child, list, i) {
  const comp = child && typeof child === "object" && typeof child.component === "string" ? child.component : "";
  if (!comp) return String(i);
  let n = 0;
  for (let j = 0; j < i; j += 1) if (list[j] && list[j].component === comp) n += 1;
  return `${comp}#${n}`;
}
function pageSlots(node, acc, path = "page") {
  if (Array.isArray(node)) {
    node.forEach((c, i) => pageSlots(c, acc, `${path}[${slotSegment(c, node, i)}]`));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") {
      if (value.trim() && !PAGE_NON_TEXT.has(key)) acc.push({ obj: node, key, id: `${path}.${key}` });
    } else if (value && typeof value === "object" && !PAGE_NON_TEXT.has(key)) {
      pageSlots(value, acc, `${path}.${key}`);
    }
  }
}
// Build display slots (unique EN → current target) for one (page, locale).
//
// Aligned by slot id, NOT by index. The old test was `en.length === tg.length`
// with `tg[i]`, which fails on the WHOLE page for any drift at all: publish one
// added or removed Storyblok block and every target slot renders blank, the
// reviewer cannot tell blank-because-drifted from blank-because-untranslated, and
// a Save then persisted those blanks stamped provenance:"human-reviewed" over the
// reviewed copy (savePage refuses that now, the other half of this fix). Keying
// each slot costs exactly the slots that actually moved: the rest still show
// their reviewed wording, and the ones that did not match are named in the label.
//
// `_uid` is deliberately NOT part of the id even though Storyblok blocks carry
// one: storyblok-fetch.mapPage runs stripStoryblok over every page this tool
// sees, so all four possible target sources (reviewed file, baked
// page-data.<locale>.json, a fresh machine translation, none) are uid-less and a
// uid key would match nothing. Measured on this repo's own data: 0 `_uid` and 64
// `component` fields across the 8 pages in src/generated/page-data*.json. The
// block tree is what every source does preserve, so that is what the id encodes.
function pageDisplaySlots(enPage, targetPage) {
  const en = []; pageSlots(enPage, en);
  const byId = new Map();
  if (targetPage) {
    const tg = []; pageSlots(targetPage, tg);
    for (const s of tg) if (!byId.has(s.id)) byId.set(s.id, s.obj[s.key]);
  }
  const rows = new Map();
  for (const s of en) {
    const enText = s.obj[s.key];
    let row = rows.get(enText);
    if (!row) { row = { key: `s:${rows.size}`, en: enText, target: "", unmatched: [] }; rows.set(enText, row); }
    const hit = byId.get(s.id) ?? "";
    // A repeated EN string is reviewed once, so the first occurrence that DID
    // match supplies the wording for every occurrence of it.
    if (!hit.trim()) row.unmatched.push(s.id);
    else if (!row.target) row.target = hit;
  }
  const slots = [...rows.values()];
  for (const row of slots) {
    // Name the slots that could not be matched, so drift reads as "these two
    // moved" instead of an unexplained empty form. Only meaningful when there IS
    // a target to align against: with no translation at all every slot is blank
    // for the obvious reason, which the item's `source` badge already says.
    const n = row.unmatched.length;
    row.label = targetPage && !row.target && n
      ? `no match in target: ${row.unmatched.slice(0, 3).join(", ")}${n > 3 ? ` +${n - 3} more` : ""}`
      : "";
    delete row.unmatched; // keep the JSON embedded in the page small
  }
  return slots;
}

async function buildPageItems() {
  const pages = await fetchStoriesByPrefix({ token, version: "published", starts_with: "pages/", content_type: "page" });
  const approvals = loadPageApprovals(pageApprovalsPath);
  const items = [];
  for (const page of pages) {
    const slug = pageSlug(page);
    const hash = pageSourceHash(page);
    for (const loc of locales) {
      const reviewed = loadReviewedPage(contentPagesDir, slug, loc);
      const baked = reviewed ? null : (readJson(resolve(generatedDir, `page-data.${loc}.json`)) ?? []).find(
        (p) => pageSlug(p) === slug,
      );
      let target = reviewed ?? baked ?? null;
      let source = reviewed ? "reviewed" : baked ? "machine" : "none";
      if (!target) {
        const t = getTranslator();
        if (t) { target = await translatePage(page, loc, t); source = "machine"; }
      }
      const appr = approvals[slug]?.[loc];
      const status = statusOf(appr?.status === "approved", appr?.sourceHash === hash, !!reviewed);
      items.push({
        domain: "page", group: slug, title: `${slug}`, locale: loc, status, source,
        ref: page.uuid, slug, slots: pageDisplaySlots(page, target),
      });
    }
  }
  return { items, pages };
}

// `locale` arrives from the browser body and is interpolated straight into an
// output filename (`${slug}.${locale}.json`), so an unvalidated value is an
// arbitrary-.json-write primitive: resolve("content/pages", "about." +
// "./../../../package" + ".json") escapes the repo. Validate against the
// locales actually in scope for this run — deliberately NOT ALL_LOCALES, which
// lives in src/i18n/locales.ts, a TS module these .mjs build scripts cannot
// import (see docs/architecture.md on why PUBLISHED_LOCALES is regex-parsed).
function assertKnownLocale(locale, locales) {
  if (typeof locale !== "string" || !locales.includes(locale)) {
    throw new Error(`refusing unknown locale: ${JSON.stringify(locale)}`);
  }
  return locale;
}

function savePage(pages, { slug, locale, values }) {
  const page = pages.find((p) => pageSlug(p) === slug);
  if (!page) throw new Error(`unknown page ${slug}`);
  if (!values || typeof values !== "object") throw new Error(`refusing to save ${slug}.${locale}: no values submitted`);
  // Rebuild the reviewed page tree: clone EN, set every translatable slot to the
  // edited value for its English string (all occurrences of a repeated string
  // get the same translation).
  const tree = structuredClone(page);
  const slots = []; pageSlots(tree, slots);
  // Refuse the write BEFORE anything is on disk if any slot would be persisted
  // empty or would be skipped. This save is what stamps status:"approved" +
  // provenance:"human-reviewed", and the build then serves the file VERBATIM, so
  // a lossy write destroys the reviewed copy and marks the wreckage as
  // human-reviewed, recoverable only from git. Both failures are silent:
  //   • empty  → a blank translation ships as the approved copy.
  //   • absent → the slot keeps its ENGLISH string, which the build serves as
  //              though a human had chosen to leave it in English.
  // A non-string value is refused with the empties: `values` is JSON from the
  // browser, so an inherited or non-text member must never reach the tree.
  const empty = [];
  const absent = [];
  for (const s of slots) {
    const en = s.obj[s.key];
    if (!Object.hasOwn(values, en)) absent.push(s.id);
    else if (typeof values[en] !== "string" || !values[en].trim()) empty.push(s.id);
  }
  if (empty.length || absent.length) {
    const list = (xs) => `${xs.slice(0, 5).join(", ")}${xs.length > 5 ? ` +${xs.length - 5} more` : ""}`;
    throw new Error(
      `refusing to save ${slug}.${locale}: ${[
        empty.length ? `${empty.length} slot(s) would be written empty (${list(empty)})` : null,
        absent.length ? `${absent.length} slot(s) were not submitted and would keep the English text (${list(absent)})` : null,
      ].filter(Boolean).join("; ")}. `
      + "Nothing was written and the approval is unchanged. Fill in every field and Save again; "
      + "if a field says \"no match in target\", the page structure changed since that translation "
      + "was made and those slots have to be re-reviewed by hand.",
    );
  }
  for (const s of slots) { const en = s.obj[s.key]; s.obj[s.key] = values[en]; }
  mkdirSync(contentPagesDir, { recursive: true });
  writeFileSync(reviewedPagePath(contentPagesDir, slug, locale), `${JSON.stringify(tree, null, 2)}\n`);
  const manifest = loadPageApprovals(pageApprovalsPath);
  manifest[slug] = manifest[slug] ?? {};
  manifest[slug][locale] = { status: "approved", sourceHash: pageSourceHash(page), provenance: "human-reviewed", reviewedAt: new Date().toISOString() };
  writeFileSync(pageApprovalsPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return `${slug}.${locale}`;
}

// ── BLOG ─────────────────────────────────────────────────────────────────────
function bodyTextNodes(story) {
  const nodes = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === "code_block") return;
    if (n.type === "text" && typeof n.text === "string" && n.text.trim()) nodes.push(n);
    if (Array.isArray(n.content)) walk(n.content);
  };
  walk(story.body);
  return nodes;
}
function blogSlots(enPost, targetStory) {
  const enNodes = bodyTextNodes(enPost);
  const tgNodes = bodyTextNodes(targetStory);
  const slots = BLOG_FIELDS.filter((f) => (enPost[f] ?? "").trim()).map((f) => ({
    key: f, label: f, en: enPost[f] ?? "", target: targetStory[f] ?? "",
  }));
  enNodes.forEach((n, i) => slots.push({ key: `body:${i}`, label: `¶${i + 1}`, en: n.text, target: tgNodes[i]?.text ?? "" }));
  return slots;
}
function rebuildBlog(enPost, submitted) {
  const story = structuredClone(enPost);
  for (const f of BLOG_FIELDS) if (f in submitted.fields) story[f] = submitted.fields[f];
  const nodes = bodyTextNodes(story);
  for (const [i, text] of Object.entries(submitted.body)) if (nodes[Number(i)]) nodes[Number(i)].text = text;
  return story;
}
async function buildBlogItems() {
  let posts = await fetchPublishedPosts({ token });
  if (onlyPost) posts = posts.filter((p) => p.slug === onlyPost);
  const approvals = loadApprovals(approvalsPath);
  const items = [];
  for (const post of posts) {
    const hash = enSourceHash(post);
    for (const loc of locales) {
      const reviewed = readJson(resolve(reviewedDir, `${post.uuid}.${loc}.json`));
      let targetStory = reviewed;
      let source = reviewed ? "reviewed" : "none";
      if (!targetStory) {
        const t = getTranslator();
        if (t) { targetStory = (await translateStories([post], loc, t))[0]; source = "machine"; }
        else { targetStory = structuredClone(post); source = "empty"; }
      }
      const appr = approvals[post.uuid]?.[loc];
      const status = statusOf(appr?.status === "approved", appr?.sourceHash === hash, !!reviewed);
      items.push({ domain: "blog", group: post.slug, title: post.slug, locale: loc, status, source, ref: post.uuid, slug: post.slug, slots: blogSlots(post, targetStory) });
    }
  }
  return { items, posts };
}
function saveBlog(posts, { ref, locale, fields, body }) {
  const post = posts.find((p) => p.uuid === ref);
  if (!post) throw new Error(`unknown post ${ref}`);
  const story = rebuildBlog(post, { fields: fields ?? {}, body: body ?? {} });
  mkdirSync(reviewedDir, { recursive: true });
  writeFileSync(resolve(reviewedDir, `${ref}.${locale}.json`), `${JSON.stringify(story, null, 2)}\n`);
  const manifest = loadApprovals(approvalsPath);
  manifest[ref] = manifest[ref] ?? {};
  manifest[ref][locale] = { status: "approved", sourceHash: enSourceHash(post), provenance: "human-reviewed", reviewedAt: new Date().toISOString() };
  writeFileSync(approvalsPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return `${post.slug}.${locale}`;
}

// ── UI STRINGS (.po) ──────────────────────────────────────────────────────────
// Group by the first `#: src/...` reference comment (the component the string
// lives in) so UI labels are reviewed in the context of where they appear.
const poRef = (e) => {
  const c = (e.comments || []).find((x) => x.startsWith("#:"));
  return c ? c.slice(2).trim().split(/\s+/)[0].replace(/:\d+$/, "") : "(no reference)";
};
function buildPoItems() {
  const enEntries = parsePo(readFileSync(resolve(catalogDir, "en.po"), "utf8")).filter((e) => !isHeader(e) && e.msgid);
  const items = [];
  for (const loc of locales) {
    const p = resolve(catalogDir, `${loc}.po`);
    if (!existsSync(p)) continue;
    const byKey = new Map(parsePo(readFileSync(p, "utf8")).map((e) => [entryKey(e), e]));
    // group entries by source-file reference
    const groups = new Map();
    for (const en of enEntries) {
      const tgt = byKey.get(entryKey(en));
      const g = poRef(en);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ key: entryKey(en), en: sourceText(en), target: tgt?.msgstr ?? "" });
    }
    for (const [g, slots] of groups) {
      items.push({ domain: "ui", group: g, title: g.replace(/^src\//, ""), locale: loc, status: "pending", source: "catalog", ref: g, slug: g, slots });
    }
  }
  return items;
}
function savePo({ locale, values }) {
  const p = resolve(catalogDir, `${locale}.po`);
  const entries = parsePo(readFileSync(p, "utf8"));
  let n = 0;
  for (const e of entries) {
    const k = entryKey(e);
    if (!isHeader(e) && k in values && values[k] !== e.msgstr) { e.msgstr = values[k]; n += 1; }
  }
  writeFileSync(p, serializePo(entries));
  return `${locale}.po (${n} string(s))`;
}

// ── gather ─────────────────────────────────────────────────────────────────
mkdirSync(reviewedDir, { recursive: true });
mkdirSync(contentPagesDir, { recursive: true });
let items = [];
let pages = [];
let posts = [];
if (wantDomain("pages")) { const r = await buildPageItems(); items.push(...r.items); pages = r.pages; }
if (wantDomain("blog")) { const r = await buildBlogItems(); items.push(...r.items); posts = r.posts; }
if (wantDomain("ui")) { items.push(...buildPoItems()); }
if (cacheObj) saveCache(cachePath, cacheObj);
if (!items.length) fatal("nothing to review (check --domain/--locale/--post filters).");

// ── save router ───────────────────────────────────────────────────────────
function save(body) {
  // Validate ONCE, here, before any writer can interpolate it into a path.
  assertKnownLocale(body.locale, locales);
  if (body.domain === "page") return savePage(pages, body);
  if (body.domain === "blog") return saveBlog(posts, body);
  if (body.domain === "ui") return savePo(body);
  throw new Error(`unknown domain ${body.domain}`);
}

// ── web app ─────────────────────────────────────────────────────────────────
function page() {
  const data = JSON.stringify(items).replace(/</g, "\\u003c");
  const locs = JSON.stringify(locales);
  return `<!doctype html><meta charset="utf8"><title>Copy review</title>
<style>
 body{font:15px/1.5 -apple-system,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#1a1a2e}
 header{position:sticky;top:0;z-index:5;background:#1a1a2e;color:#fff;padding:12px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
 header b{font-weight:700}
 header select{font:inherit;padding:4px 8px;border-radius:6px;border:0}
 .hint{color:#b9c0e0;font-size:13px}
 .item{background:#fff;margin:16px;border:1px solid #e2e4e8;border-radius:8px;overflow:hidden}
 .head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#f0f1f4;border-bottom:1px solid #e2e4e8;cursor:pointer}
 .head .meta{display:flex;gap:8px;align-items:center}
 .dom{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5b6ee1;font-weight:700}
 .badge{font-size:12px;padding:2px 8px;border-radius:99px;color:#fff}
 .approved{background:#2a9d5c}.pending{background:#c98a00}.new{background:#5b6ee1}.stale{background:#c0392b}.catalog{background:#7a7f8c}
 .body{display:none}.item.open .body{display:block}
 .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:10px 16px;border-bottom:1px solid #f0f1f4}
 .lbl{font-size:11px;text-transform:uppercase;color:#888;grid-column:1/3;margin-bottom:-4px}
 .en{white-space:pre-wrap;color:#444;padding:6px 8px;background:#fafbfc;border-radius:5px}
 textarea{width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border:1px solid #cdd0d6;border-radius:5px;resize:vertical;min-height:2.6em}
 .save{padding:8px 18px;border:0;border-radius:6px;background:#5b6ee1;color:#fff;font-weight:600;cursor:pointer}
 .save:disabled{opacity:.5}
 footer{padding:10px 16px}
</style>
<header>
 <b>Copy review</b>
 <label>Language <select id=fl></select></label>
 <label>Section <select id=fd></select></label>
 <span class="hint">English on the left · edit the right · Save writes the reviewed copy + locks it from auto-translation. Commit when done.</span>
</header>
<div id=root></div>
<script>
const items=${data}, locales=${locs};
const root=document.getElementById("root"), fl=document.getElementById("fl"), fd=document.getElementById("fd");
const DOM={page:"Pages",blog:"Blog",ui:"UI strings"};
fl.innerHTML='<option value=all>All ('+locales.join(", ")+')</option>'+locales.map(l=>'<option value="'+l+'">'+l.toUpperCase()+'</option>').join("");
const doms=[...new Set(items.map(i=>i.domain))];
fd.innerHTML='<option value=all>All</option>'+doms.map(d=>'<option value="'+d+'">'+(DOM[d]||d)+'</option>').join("");
function esc(s){return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
function render(){
 const fLoc=fl.value, fDom=fd.value; root.innerHTML="";
 const shown=items.filter(it=>(fLoc==="all"||it.locale===fLoc)&&(fDom==="all"||it.domain===fDom));
 if(!shown.length){root.innerHTML='<p style="margin:24px">Nothing matches this filter.</p>';return;}
 shown.forEach(it=>{
  const box=document.createElement("div");box.className="item";
  const open=it.status!=="approved";if(open)box.classList.add("open");
  box.innerHTML='<div class=head><span class=meta><span class=dom>'+(DOM[it.domain]||it.domain)+'</span><b>'+esc(it.title)+' · '+it.locale.toUpperCase()+'</b></span>'+
    '<span class="badge '+it.status+'">'+it.status+' · '+it.source+'</span></div>';
  box.querySelector(".head").onclick=()=>box.classList.toggle("open");
  const body=document.createElement("div");body.className="body";
  it.slots.forEach(s=>{
   const r=document.createElement("div");r.className="row";
   r.innerHTML='<div class=lbl>'+esc(s.label||"")+'</div><div class=en>'+esc(s.en)+'</div>';
   const ta=document.createElement("textarea");ta.value=s.target;ta.dataset.k=s.key;ta.dataset.en=s.en;
   r.appendChild(ta);body.appendChild(r);
  });
  const foot=document.createElement("footer");
  const btn=document.createElement("button");btn.className="save";btn.textContent="Save & approve";
  btn.onclick=async()=>{
   btn.disabled=true;btn.textContent="Saving…";
   const payload={domain:it.domain,locale:it.locale,ref:it.ref,slug:it.slug};
   if(it.domain==="blog"){const fields={},bodyv={};body.querySelectorAll("textarea").forEach(ta=>{const k=ta.dataset.k;if(k.startsWith("body:"))bodyv[k.slice(5)]=ta.value;else fields[k]=ta.value;});payload.fields=fields;payload.body=bodyv;}
   else if(it.domain==="page"){const values={};body.querySelectorAll("textarea").forEach(ta=>values[ta.dataset.en]=ta.value);payload.values=values;}
   else{const values={};body.querySelectorAll("textarea").forEach(ta=>values[ta.dataset.k]=ta.value);payload.values=values;}
   const res=await fetch("/save",{method:"POST",headers:{"content-type":"application/json","x-review-token":"${REVIEW_TOKEN}"},body:JSON.stringify(payload)});
   const j=await res.json();
   btn.textContent=j.ok?"Saved ✓ "+j.saved:"Error: "+j.error;btn.disabled=false;
   if(j.ok){const b=box.querySelector(".badge");b.className="badge approved";b.textContent="approved · saved";}
  };
  foot.appendChild(btn);body.appendChild(foot);box.appendChild(body);root.appendChild(box);
 });
}
fl.onchange=render;fd.onchange=render;render();
</script>`;
}

// ---- Local-only hardening -------------------------------------------------
// This server MUTATES REPO FILES (reviewed translations + approval manifests
// that the build then serves verbatim), so it must be unreachable from anything
// but this machine's own browser session. Three independent guards, because no
// single one is sufficient:
//
//  1. Bind to 127.0.0.1. `listen(port)` with no host binds `::`/0.0.0.0, i.e.
//     every interface — on shared wifi any peer could POST /save.
//  2. Require a per-run token in a CUSTOM header. Loopback alone does NOT stop
//     browser CSRF (a malicious tab can reach http://127.0.0.1:4477), and a
//     `<form enctype="text/plain">` can forge a body that JSON.parse accepts
//     with no preflight. A custom header forces a CORS preflight that a form can
//     never satisfy, and also defeats DNS rebinding.
//  3. Reject anything that is not application/json, and refuse a cross-origin
//     Origin outright.
const REVIEW_TOKEN = randomUUID();

function forbidden(req) {
  if (req.headers["x-review-token"] !== REVIEW_TOKEN) return "bad or missing token";
  const ct = String(req.headers["content-type"] ?? "").split(";")[0].trim();
  if (ct !== "application/json") return `unexpected content-type: ${ct || "(none)"}`;
  const origin = req.headers.origin;
  if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
    return `cross-origin request refused: ${origin}`;
  }
  return null;
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/save") {
    const why = forbidden(req);
    if (why) {
      console.warn(`  ✗ refused /save from ${req.socket.remoteAddress}: ${why}`);
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "forbidden" }));
      return;
    }
    let raw = "";
    let tooBig = false;
    req.on("data", (c) => {
      if (tooBig) return;
      raw += c;
      if (raw.length > 4_000_000) { tooBig = true; req.destroy(); }
    });
    req.on("end", () => {
      if (tooBig) return;
      try {
        const saved = save(JSON.parse(raw));
        console.log(`  ✓ saved ${saved}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, saved }));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e?.message ?? e) }));
      }
    });
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page());
});
server.listen(port, "127.0.0.1", () => {
  const need = items.filter((i) => i.status !== "approved").length;
  const byDom = [...new Set(items.map((i) => i.domain))].map((d) => `${items.filter((i) => i.domain === d).length} ${d}`).join(", ");
  console.log(`\n  Copy review — ${items.length} item(s) [${byDom}] across ${locales.map((l) => LOCALE_NAME[l]).join(", ")} (${need} needing review)`);
  console.log(`  ▶ open http://127.0.0.1:${port}  — edit, Save & approve, then Ctrl+C and:  git add content/ src/i18n/catalogs/ && git commit -S`);
});

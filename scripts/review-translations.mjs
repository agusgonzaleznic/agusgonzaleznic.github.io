// scripts/review-translations.mjs — LOCAL side-by-side translation review.
//
// Replaces the old GitHub-PR translation-review flow. Starts a
// local web app where you read the English source next to each machine
// translation, edit any string in any language, and Save — which writes the
// reviewed translation to content/translations/<uuid>.<locale>.json and marks it
// approved (+ a sourceHash so editing the English later auto-demotes it). Then you
// commit the changes yourself (signed) — no pull request.
//
// Machine translation (DeepL + the Claude voice post-edit) is generated only for
// (post, locale) pairs that don't already have a translation file, so you can
// review existing ones with no API key. Generating fresh drafts needs
// DEEPL_API_KEY (+ ANTHROPIC_API_KEY for the voice post-edit; without it you get
// raw DeepL to edit).
//
// Run:
//   op run --env-file="$HOME/.env" --no-masking -- node scripts/review-translations.mjs
//   ... --all           review all five locales (default: only the gated de/es)
//   ... --post <slug>    just one article
//   ... --port <n>       (default 4477)
//
// The build (scripts/fetch-blog.mjs) already serves approved+fresh translations
// verbatim and auto-translates the rest — this tool only produces those approved
// files, so nothing else in the pipeline changes.

import { createServer } from "node:http";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTranslator, hasApiKey, loadCache, saveCache, loadGlossary, loadGlossaryTerms,
} from "./lib/deepl.mjs";
import { createPostEditor, hasAnthropicKey, POSTEDIT_VERSION } from "./lib/llm-postedit.mjs";
import { translateStories } from "./lib/richtext-translate.mjs";
import { fetchPublishedPosts } from "./lib/storyblok-fetch.mjs";
import {
  REVIEW_GATED_LOCALES, AUTO_LOCALES, enSourceHash, loadApprovals,
} from "./lib/blog-gate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const reviewedDir = resolve(__dirname, "../content/translations");
const approvalsPath = resolve(__dirname, "../content/i18n-approvals.json");
const cachePath = resolve(__dirname, ".i18n-cache.json");
const glossaryPath = resolve(__dirname, "i18n-glossary.json");

const LOCALE_NAME = { de: "Deutsch", es: "Español", fr: "Français", it: "Italiano", pt: "Português" };
const FIELDS = ["title", "excerpt", "seo_title", "seo_description"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const port = Number(opt("--port", "4477"));
const onlyPost = opt("--post", null);
const locales = flag("--all") ? [...REVIEW_GATED_LOCALES, ...AUTO_LOCALES] : REVIEW_GATED_LOCALES;

const fatal = (m) => { console.error(`review-translations: ${m}`); process.exit(1); };
const reviewedPath = (uuid, loc) => resolve(reviewedDir, `${uuid}.${loc}.json`);
const loadReviewed = (uuid, loc) =>
  existsSync(reviewedPath(uuid, loc)) ? JSON.parse(readFileSync(reviewedPath(uuid, loc), "utf8")) : null;

// Ordered translatable text nodes in a story body (skips code, matches the
// translator + gate), so extract and inject use the exact same sequence.
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

// Build the display slots (EN vs current target) for one (post, locale).
function slotsFor(enPost, targetStory) {
  const enNodes = bodyTextNodes(enPost);
  const tgNodes = bodyTextNodes(targetStory);
  const slots = FIELDS.filter((f) => (enPost[f] ?? "").trim()).map((f) => ({
    key: f, label: f, en: enPost[f] ?? "", target: targetStory[f] ?? "",
  }));
  enNodes.forEach((n, i) => {
    slots.push({ key: `body:${i}`, label: `body ¶${i + 1}`, en: n.text, target: tgNodes[i]?.text ?? "" });
  });
  return slots;
}

// Inject reviewed strings back into a fresh EN-cloned story (preserves ALL
// structure, marks, links, and non-text fields — only text changes).
function rebuild(enPost, submitted) {
  const story = structuredClone(enPost);
  for (const f of FIELDS) if (f in submitted.fields) story[f] = submitted.fields[f];
  const nodes = bodyTextNodes(story);
  for (const [i, text] of Object.entries(submitted.body)) if (nodes[Number(i)]) nodes[Number(i)].text = text;
  return story;
}

// ── gather review items ─────────────────────────────────────────────────────
const token = process.env.STORYBLOK_PUBLIC_TOKEN;
if (!token) fatal("STORYBLOK_PUBLIC_TOKEN is required (run under `op run`).");
let posts = await fetchPublishedPosts({ token });
if (onlyPost) posts = posts.filter((p) => p.slug === onlyPost);
if (!posts.length) fatal(onlyPost ? `no published post with slug '${onlyPost}'.` : "no published posts.");

// Translator is lazy: only built if we actually need to machine-translate.
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

mkdirSync(reviewedDir, { recursive: true });
const approvals = loadApprovals(approvalsPath);
const items = [];
for (const post of posts) {
  const hash = enSourceHash(post);
  for (const loc of locales) {
    const reviewed = loadReviewed(post.uuid, loc);
    let targetStory = reviewed;
    let source = reviewed ? "file" : "none";
    if (!targetStory) {
      const t = getTranslator();
      if (t) {
        console.log(`  translating ${post.slug} → ${loc} …`);
        targetStory = (await translateStories([post], loc, t))[0];
        source = "machine";
      } else {
        targetStory = structuredClone(post); // no keys: start from EN, edit manually
        source = "empty";
      }
    }
    const appr = approvals[post.uuid]?.[loc];
    const status = appr?.status === "approved" && appr.sourceHash === hash ? "approved"
      : appr?.status === "approved" ? "stale" : reviewed ? "pending" : "new";
    items.push({ uuid: post.uuid, slug: post.slug, locale: loc, status, source, slots: slotsFor(post, targetStory) });
  }
}
if (cacheObj) saveCache(cachePath, cacheObj);

// ── save handler ────────────────────────────────────────────────────────────
function save({ uuid, locale, fields, body }) {
  const post = posts.find((p) => p.uuid === uuid);
  if (!post) throw new Error(`unknown uuid ${uuid}`);
  const story = rebuild(post, { fields, body });
  writeFileSync(reviewedPath(uuid, locale), `${JSON.stringify(story, null, 2)}\n`);
  const manifest = loadApprovals(approvalsPath);
  manifest[uuid] = manifest[uuid] ?? {};
  manifest[uuid][locale] = { status: "approved", sourceHash: enSourceHash(post), provenance: "human-reviewed", reviewedAt: new Date().toISOString() };
  writeFileSync(approvalsPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return `${post.slug}.${locale}`;
}

// ── web app ─────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
function page() {
  const data = JSON.stringify(items).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf8"><title>Translation review</title>
<style>
 body{font:15px/1.5 -apple-system,system-ui,sans-serif;margin:0;background:#f6f7f9;color:#1a1a2e}
 header{position:sticky;top:0;background:#1a1a2e;color:#fff;padding:12px 20px;font-weight:600}
 .item{background:#fff;margin:16px;border:1px solid #e2e4e8;border-radius:8px;overflow:hidden}
 .head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#f0f1f4;border-bottom:1px solid #e2e4e8}
 .badge{font-size:12px;padding:2px 8px;border-radius:99px;color:#fff}
 .approved{background:#2a9d5c}.pending{background:#c98a00}.new{background:#5b6ee1}.stale{background:#c0392b}
 .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:10px 16px;border-bottom:1px solid #f0f1f4}
 .lbl{font-size:11px;text-transform:uppercase;color:#888;grid-column:1/3;margin-bottom:-4px}
 .en{white-space:pre-wrap;color:#444;padding:6px 8px;background:#fafbfc;border-radius:5px}
 textarea{width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border:1px solid #cdd0d6;border-radius:5px;resize:vertical;min-height:2.6em}
 .save{padding:8px 18px;border:0;border-radius:6px;background:#5b6ee1;color:#fff;font-weight:600;cursor:pointer}
 .save:disabled{opacity:.5}
</style>
<header>Translation review — edit any string, then Save (writes content/translations/ + approves). Commit when done.</header>
<div id=root></div>
<script>
const items=${data};
const root=document.getElementById("root");
items.forEach((it,idx)=>{
 const box=document.createElement("div");box.className="item";
 box.innerHTML='<div class=head><b>'+it.slug+' · '+it.locale.toUpperCase()+'</b>'+
   '<span class="badge '+it.status+'">'+it.status+' · '+it.source+'</span></div>';
 it.slots.forEach((s,si)=>{
   const r=document.createElement("div");r.className="row";
   r.innerHTML='<div class=lbl>'+s.label+'</div><div class=en>'+escapeHtml(s.en)+'</div>';
   const ta=document.createElement("textarea");ta.value=s.target;ta.dataset.key=s.key;
   r.appendChild(ta);box.appendChild(r);
 });
 const foot=document.createElement("div");foot.style.padding="12px 16px";
 const btn=document.createElement("button");btn.className="save";btn.textContent="Save & approve";
 btn.onclick=async()=>{
   btn.disabled=true;btn.textContent="Saving…";
   const fields={},body={};
   box.querySelectorAll("textarea").forEach(ta=>{const k=ta.dataset.key;
     if(k.startsWith("body:"))body[k.slice(5)]=ta.value;else fields[k]=ta.value;});
   const res=await fetch("/save",{method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({uuid:it.uuid,locale:it.locale,fields,body})});
   const j=await res.json();
   btn.textContent=j.ok?"Saved ✓ "+j.saved:"Error";btn.disabled=false;
   box.querySelector(".badge").className="badge approved";box.querySelector(".badge").textContent="approved · saved";
 };
 foot.appendChild(btn);box.appendChild(foot);root.appendChild(box);
});
function escapeHtml(s){return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
</script>`;
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/save") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
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
server.listen(port, () => {
  const n = items.filter((i) => i.status !== "approved").length;
  console.log(`\n  Translation review — ${items.length} item(s) (${n} needing review) across ${locales.map((l) => LOCALE_NAME[l]).join(", ")}`);
  console.log(`  ▶ open http://localhost:${port}  — edit, Save & approve, then Ctrl+C and:  git add content/ && git commit -S`);
});

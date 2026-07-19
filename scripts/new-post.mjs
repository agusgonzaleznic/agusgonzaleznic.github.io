// scripts/new-post.mjs — author a blog post from a Markdown OR HTML file.
//
// Converts the body to Storyblok richtext (only the node types the site's
// renderer supports — see src/components/blog/RichText.tsx) and creates or
// updates the DRAFT story `blog/<slug>` via the Management API. Nothing is
// published: review it in Storyblok, then hit Publish (that fires the rebuild
// webhook, which fetches + auto-translates it like every other post).
//
// USAGE
//   op run --env-file="$HOME/.env" --no-masking -- \
//     node scripts/new-post.mjs path/to/post.md          # create/update the draft
//   node scripts/new-post.mjs path/to/post.md --dry-run  # print the richtext, no API call
//
// INPUT FILE: an optional YAML-ish frontmatter fence, then the body (md or html
// by file extension). Frontmatter is flat `key: value` (first colon splits, so
// values may contain colons; surrounding quotes are stripped):
//   ---
//   slug: alert-fatigue-and-fuck-bingo
//   title: Alert Fatigue and Fuck Bingo
//   excerpt: A short teaser (<=200) — also the default meta description.
//   seo_title: Optional <title> override (<=60)
//   seo_description: Optional meta description override (<=160)
//   published_date: 2026-07-19 09:00
//   original_url:          # ONLY if republished elsewhere; empty = self-canonical
//   canonical_override:    # leave empty
//   ---
//   <body>
//
// BODY NOTES: a leading <h1> is dropped (the `title` field owns the headline).
// Unsupported elements degrade to their text content so nothing is silently
// lost. Tables and raw embeds aren't supported by the renderer — avoid them.
//
// SECURITY: the management token is read ONLY from the environment
// (STORYBLOK_MANAGEMENT_TOKEN, injected by `op run`). Never hardcode it.

import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import MarkdownIt from "markdown-it";
import { parse, NodeType } from "node-html-parser";

const SPACE = "288632938663524";
const API = `https://mapi.storyblok.com/v1/spaces/${SPACE}`;
const BLOG_FOLDER_SLUG = "blog";

// ── frontmatter ─────────────────────────────────────────────────────────────
function parseFrontmatter(raw) {
  const m = raw.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!m) return { data: {}, body: raw.replace(/^﻿/, "") };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1);
    data[key] = val;
  }
  return { data, body: raw.slice(m[0].length) };
}

// ── source → HTML ───────────────────────────────────────────────────────────
// linkify/typographer OFF so the output mirrors the author's exact characters
// (only explicit [text](url) become links; quotes/dashes are left untouched).
const md = new MarkdownIt({ html: true, linkify: false, typographer: false, breaks: false });
function toHtml(body, ext) {
  return ext === ".html" || ext === ".htm" ? body : md.render(body);
}

// ── HTML → Storyblok richtext ───────────────────────────────────────────────
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, e) => {
    if (e[0] === "#") {
      const cp = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    return NAMED[e] ?? whole;
  });
}

const MARK_TAGS = {
  strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline",
  s: "strike", del: "strike", strike: "strike", code: "code",
  sup: "superscript", sub: "subscript",
};
const BLOCK_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol",
  "pre", "hr", "figure", "img", "div", "section", "article",
]);

const tagOf = (el) => (el.rawTagName || "").toLowerCase();
const isElement = (n) => n.nodeType === NodeType.ELEMENT_NODE;
const isText = (n) => n.nodeType === NodeType.TEXT_NODE;

function linkMark(el) {
  const raw = el.getAttribute("href") || "";
  const isEmail = raw.startsWith("mailto:");
  const external = /^(https?:)?\/\//.test(raw);
  return {
    type: "link",
    attrs: {
      href: isEmail ? raw.replace(/^mailto:/, "") : raw,
      uuid: null,
      anchor: null,
      custom: {},
      target: external ? "_blank" : null,
      linktype: isEmail ? "email" : "url",
    },
  };
}

// A DOM node → array of inline richtext nodes, threading accumulated marks down.
function inlineNodes(node, marks) {
  if (isText(node)) {
    const text = decodeEntities(node.rawText);
    return text ? [markedText(text, marks)] : [];
  }
  if (!isElement(node)) return [];
  const tag = tagOf(node);
  if (tag === "br") return [{ type: "hard_break" }];
  if (tag === "img") return [imageNode(node)].filter(Boolean); // stray inline img
  const nextMarks =
    tag === "a" ? [...marks, linkMark(node)] : MARK_TAGS[tag] ? [...marks, { type: MARK_TAGS[tag] }] : marks;
  return node.childNodes.flatMap((c) => inlineNodes(c, nextMarks));
}
function markedText(text, marks) {
  const n = { type: "text", text };
  if (marks.length) n.marks = marks.map((m) => ({ ...m }));
  return n;
}

function imageNode(el) {
  const src = el.getAttribute("src") || "";
  if (!src) return null;
  return {
    type: "image",
    attrs: { src, alt: el.getAttribute("alt") || "", title: el.getAttribute("title") || "" },
  };
}

// Children of a block container → array of block richtext nodes. Consecutive
// inline content is grouped into a paragraph; whitespace-only runs are dropped.
function blockContent(parent) {
  const blocks = [];
  let run = [];
  const flush = () => {
    if (run.some((n) => n.type !== "text" || n.text.trim())) {
      blocks.push({ type: "paragraph", content: run });
    }
    run = [];
  };
  for (const child of parent.childNodes) {
    if (isElement(child) && BLOCK_TAGS.has(tagOf(child))) {
      flush();
      const b = blockNode(child);
      if (Array.isArray(b)) blocks.push(...b);
      else if (b) blocks.push(b);
    } else {
      run.push(...inlineNodes(child, []));
    }
  }
  flush();
  return blocks;
}

function blockNode(el) {
  const tag = tagOf(el);
  if (/^h[1-6]$/.test(tag)) {
    return { type: "heading", attrs: { level: Number(tag[1]) }, content: inlineNodes(el, []) };
  }
  switch (tag) {
    case "p": {
      // A paragraph that is only an image → hoist to an image block (a <figure>
      // inside a <p> is invalid HTML and breaks hydration).
      const kids = el.childNodes.filter((c) => !(isText(c) && !c.rawText.trim()));
      if (kids.length === 1 && isElement(kids[0]) && tagOf(kids[0]) === "img") {
        return imageNode(kids[0]);
      }
      return { type: "paragraph", content: inlineNodes(el, []) };
    }
    case "blockquote":
      return { type: "blockquote", content: blockContent(el) };
    case "ul":
      return { type: "bullet_list", content: listItems(el) };
    case "ol":
      return { type: "ordered_list", content: listItems(el) };
    case "pre": {
      const code = el.childNodes.find((c) => isElement(c) && tagOf(c) === "code") || el;
      const cls = (code.getAttribute?.("class") || "").match(/language-[\w-]+/);
      const attrs = cls ? { class: cls[0] } : {};
      return {
        type: "code_block",
        attrs,
        content: [{ type: "text", text: decodeEntities(code.rawText || code.text || "") }],
      };
    }
    case "hr":
      return { type: "horizontal_rule" };
    case "img":
      return imageNode(el);
    case "figure": {
      const img = el.childNodes.find((c) => isElement(c) && tagOf(c) === "img");
      const cap = el.childNodes.find((c) => isElement(c) && tagOf(c) === "figcaption");
      const n = img && imageNode(img);
      if (n && cap) n.attrs.title = decodeEntities(cap.text || cap.rawText || "").trim();
      return n || blockContent(el);
    }
    // transparent wrappers: flatten
    case "div":
    case "section":
    case "article":
      return blockContent(el);
    default:
      return null;
  }
}

function listItems(listEl) {
  return listEl.childNodes
    .filter((c) => isElement(c) && tagOf(c) === "li")
    .map((li) => {
      const content = blockContent(li);
      // A list_item must hold block nodes; if the <li> had only inline content,
      // blockContent already wrapped it in a paragraph.
      return { type: "list_item", content: content.length ? content : [{ type: "paragraph", content: [] }] };
    });
}

function htmlToRichtext(html) {
  const root = parse(html, { comment: false });
  const blocks = blockContent(root);
  // The title field owns the headline: drop a single leading <h1>.
  if (blocks[0]?.type === "heading" && blocks[0].attrs?.level === 1) blocks.shift();
  return { type: "doc", content: blocks };
}

// ── Storyblok Management API ────────────────────────────────────────────────
async function api(method, path, body) {
  const token = process.env.STORYBLOK_MANAGEMENT_TOKEN;
  if (!token) throw new Error("STORYBLOK_MANAGEMENT_TOKEN missing (run under `op run`).");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

async function findStory(fullSlug) {
  const q = await api("GET", `/stories?with_slug=${encodeURIComponent(fullSlug)}`);
  return q.stories?.[0] || null;
}
async function blogFolderId() {
  const q = await api("GET", "/stories?per_page=100");
  const folder = q.stories.find((s) => s.is_folder && s.slug === BLOG_FOLDER_SLUG);
  if (!folder) throw new Error(`No '${BLOG_FOLDER_SLUG}/' folder in the space.`);
  return folder.id;
}

// ── main ────────────────────────────────────────────────────────────────────
const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!file) {
  console.error("Usage: node scripts/new-post.mjs <file.md|file.html> [--dry-run]");
  process.exit(1);
}

const raw = readFileSync(resolve(file), "utf8");
const { data, body } = parseFrontmatter(raw);
const ext = extname(file).toLowerCase();
const richtext = htmlToRichtext(toHtml(body, ext));

const slug = data.slug;
if (!slug) {
  console.error("Frontmatter needs a `slug:` (the URL segment under /blog/).");
  process.exit(1);
}
const content = {
  component: "blog_post",
  title: data.title || "",
  excerpt: data.excerpt || "",
  body: richtext,
  published_date: data.published_date || "",
  seo_title: data.seo_title || "",
  seo_description: data.seo_description || "",
  original_url: data.original_url || "",
  canonical_override: data.canonical_override || "",
};

// Report + light validation
const flat = JSON.stringify(richtext);
const count = (t) => (flat.match(new RegExp(`"type":"${t}"`, "g")) || []).length;
console.log(`\n📄 ${data.title || "(no title)"}  →  blog/${slug}`);
console.log(
  `   body: ${count("heading")} heading(s), ${count("paragraph")} paragraph(s), ` +
    `${count("blockquote")} quote(s), ${count("bullet_list") + count("ordered_list")} list(s), ` +
    `${count("code_block")} code block(s), ${count("image")} image(s), ${count("link")} link(s)`,
);
const warn = [];
for (const [f, max] of [["title", 999], ["excerpt", 200], ["seo_title", 60], ["seo_description", 160]]) {
  if (!content[f] && (f === "title" || f === "excerpt")) warn.push(`missing ${f}`);
  if (content[f] && content[f].length > max) warn.push(`${f} is ${content[f].length} chars (>${max})`);
}
if (!content.published_date) warn.push("missing published_date");
if (warn.length) console.log("   ⚠ " + warn.join("; "));

if (dryRun) {
  console.log("\n--- richtext (dry run, not sent) ---");
  console.log(JSON.stringify(richtext, null, 1));
  process.exit(0);
}

const fullSlug = `blog/${slug}`;
const existing = await findStory(fullSlug);
if (existing) {
  await api("PUT", `/stories/${existing.id}`, { story: { name: content.title, slug, content } });
  console.log(`\n✓ updated DRAFT ${fullSlug} (id ${existing.id})`);
} else {
  const parent_id = await blogFolderId();
  const created = await api("POST", "/stories", { story: { name: content.title, slug, parent_id, content } });
  console.log(`\n✓ created DRAFT ${fullSlug} (id ${created.story.id})`);
}
console.log("   Review it in Storyblok, then Publish to go live (auto-translates on rebuild).");

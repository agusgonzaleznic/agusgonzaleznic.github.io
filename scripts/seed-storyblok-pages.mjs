// One-time seeder for migrating the marketing pages into Storyblok, run by the
// owner via `op` (needs STORYBLOK_MANAGEMENT_TOKEN). Idempotent and DRAFT-ONLY
// for content (publish=0), so it never affects production; re-running updates in
// place. Three steps:
//   1. Prime the page-translation cache from the CURRENT Lingui .po catalogs, so
//      every locale reproduces today's exact wording (nothing changes day one).
//   2. Ensure the Storyblok component schema matches the design (create/replace
//      the components below). Mirrors terraform/storyblok.tf.
//   3. Create/update the DRAFT `pages/<slug>` stories from the current copy.
//
// Usage:
//   op run --env-file ~/.env --no-masking -- node scripts/seed-storyblok-pages.mjs
//
// SECURITY: the token is read from env only, sent in the Authorization header,
// never logged. A non-OK response never echoes the request.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCache, saveCache, seedCache, TARGET_LOCALES } from "./lib/deepl.mjs";
import { collectTranslatableStrings } from "./lib/page-translate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cachePath = resolve(__dirname, ".i18n-cache.json");
const catalogsDir = resolve(__dirname, "../src/i18n/catalogs");

const SPACE_ID = "288632938663524";
const API = `https://mapi.storyblok.com/v1/spaces/${SPACE_ID}`;
const PAGE_CACHE_SALT = "pages-v1"; // must match scripts/fetch-pages.mjs

const ICON = [
  "Lightbulb", "Cog", "Heart", "Target", "ShieldCheck", "MessagesSquare",
  "Wrench", "TrendingDown", "Shield", "Rocket", "Zap", "Users",
].map((v) => ({ name: v, value: v }));
const THEME = [
  { name: "Accent", value: "accent" },
  { name: "Primary", value: "primary" },
];

// ── Schema field helpers ──────────────────────────────────────────────────────
const T = (pos, display_name, extra = {}) => ({ type: "text", pos, display_name, ...extra });
const TA = (pos, display_name, extra = {}) => ({ type: "textarea", pos, display_name, ...extra });
const OPT = (pos, display_name, options, extra = {}) => ({ type: "option", pos, display_name, options, ...extra });
const BLOKS = (pos, display_name, whitelist) => ({ type: "bloks", pos, display_name, restrict_components: true, component_whitelist: whitelist });
const BOOL = (pos, display_name) => ({ type: "boolean", pos, display_name, default_value: "true" });
const nest = (display_name, icon, schema) => ({ display_name, is_root: false, is_nestable: true, icon, schema });

// ── Component schemas (the design's real content model) ───────────────────────
const COMPONENTS = {
  text_item: nest("Text", "block-paragraph", { text: TA(0, "Text", { required: true }) }),
  value_item: nest("Value", "block-sticker", {
    icon: OPT(0, "Icon", ICON), title: T(1, "Title", { required: true }), description: TA(2, "Description", { required: true }),
  }),
  how_i_work_block: nest("How I Work Block", "block-sticker", {
    heading: T(0, "Heading"), values: BLOKS(1, "Values", ["value_item"]), show_section: BOOL(2, "Show This Section"),
  }),
  philosophy_block: nest("Philosophy Block", "block-sticker", {
    heading: T(0, "Heading"), subheading: TA(1, "Subheading"), principles: BLOKS(2, "Principles", ["principle_item"]), show_section: BOOL(3, "Show This Section"),
  }),
  principle_item: nest("Principle", "block-sticker", {
    icon: OPT(0, "Icon", ICON), title: T(1, "Title", { required: true }), description: TA(2, "Description", { required: true }), color: OPT(3, "Color Theme", THEME, { default_value: "accent" }),
  }),
  about_block: nest("About Block", "block-image", {
    heading: T(0, "Heading", { required: true }), image_alt: T(1, "Image Alt Text"), paragraphs: BLOKS(2, "Paragraphs", ["text_item"]), footnote: TA(3, "Footnote"), show_section: BOOL(4, "Show This Section"),
  }),
  service_item: nest("Service Item", "block-suitcase", {
    title: T(0, "Title", { required: true }), subtitle: T(1, "Subtitle"), description: TA(2, "Description", { required: true }), features: BLOKS(3, "Features", ["text_item"]), format: T(4, "Session Format"), best_for: T(5, "Best For"), featured: { type: "boolean", pos: 6, display_name: "Featured (Most Popular)", default_value: "false" },
  }),
  services_block: nest("Services Block", "block-suitcase", {
    heading: T(0, "Heading"), subheading: TA(1, "Subheading"), services: BLOKS(2, "Services", ["service_item"]), bottom_prompt: TA(3, "Bottom Prompt"), show_section: BOOL(4, "Show This Section"),
  }),
  engagement_item: nest("Engagement", "block-comment", {
    role: T(0, "Role", { required: true }), context: T(1, "Context"), sketch: TA(2, "Sketch", { required: true }),
  }),
  testimonials_block: nest("Testimonials Block", "block-comment", {
    heading: T(0, "Heading"), subheading: TA(1, "Subheading"), engagements: BLOKS(2, "Engagements", ["engagement_item"]), note: TA(3, "Confidentiality Note"), show_section: BOOL(4, "Show This Section"),
  }),
  timeline_item: nest("Timeline Item", "block-table", {
    period: T(0, "Period"), company: T(1, "Company"), role: T(2, "Role", { required: true }), achievement: TA(3, "Achievement", { required: true }),
  }),
  stat_item: nest("Stat Item", "block-table-2", {
    icon: OPT(0, "Icon", ICON), value: T(1, "Value", { required: true }), label: T(2, "Label", { required: true }), description: TA(3, "Description"),
  }),
  impact_block: nest("Impact Block", "block-table", {
    timeline_heading: T(0, "Timeline Heading"), timeline: BLOKS(1, "Timeline", ["timeline_item"]), stats_heading: T(2, "Stats Heading"), stats_subheading: TA(3, "Stats Subheading"), stats: BLOKS(4, "Stats", ["stat_item"]), show_section: BOOL(5, "Show This Section"),
  }),
  faq_item: nest("FAQ Item", "block-comment", {
    question: T(0, "Question", { required: true }), answer: TA(1, "Answer", { required: true }),
  }),
  faq_block: nest("FAQ Block", "block-comment", {
    heading: T(0, "Heading"), subheading: TA(1, "Subheading"), faqs: BLOKS(2, "FAQs", ["faq_item"]), show_section: BOOL(3, "Show This Section"),
  }),
  contact_block: nest("Contact Block", "block-email", {
    heading: T(0, "Heading"), subheading: TA(1, "Subheading"), get_in_touch_heading: T(2, "Get in Touch Heading"), response_time_heading: T(3, "Response Time Heading"), response_time_text: TA(4, "Response Time Text"), discovery_call_heading: T(5, "Discovery Call Heading"), discovery_call_text: TA(6, "Discovery Call Text"), show_section: BOOL(7, "Show This Section"),
  }),
  hero_block: nest("Hero Block", "block-block", {
    badge: T(0, "Badge"), subheading: TA(1, "Subheading"), cta_text: T(2, "CTA Text"), industries_label: T(3, "Industries Label"), industries: TA(4, "Industries (one per line, not translated)"), image_alt: T(5, "Image Alt Text"), show_section: BOOL(6, "Show This Section"),
  }),
  page: {
    display_name: "Page", is_root: true, is_nestable: false, icon: "block-doc",
    schema: {
      body: BLOKS(0, "Page Content", ["hero_block", "about_block", "philosophy_block", "how_i_work_block", "services_block", "impact_block", "testimonials_block", "faq_block", "contact_block"]),
      seo_title: T(1, "SEO Title", { max_length: 60 }),
      seo_description: TA(2, "SEO Description", { max_length: 160 }),
      og_image: { type: "asset", pos: 3, display_name: "Social Media Image", filetypes: ["images"] },
    },
  },
};

// ── Page content (English source == current component copy) ───────────────────
const ti = (text) => ({ component: "text_item", text });
const PAGES = [
  {
    slug: "home",
    seo_title: "",
    seo_description: "",
    body: [{
      component: "hero_block",
      badge: "15+ years leading engineering teams",
      subheading: "One-on-one coaching for senior engineering leaders, from first-time managers to CTOs. We work on what you're measured by: delivery, retention, and an org that runs without heroics.",
      cta_text: "How Coaching Works",
      industries_label: "Industries where I've led teams:",
      industries: "Fintech\nGaming\nE-Mobility\nHealthTech\nWeb3",
      image_alt: "Agustin Gonzalez Nicolini - Engineering Leadership Coach",
      show_section: true,
    }],
  },
  {
    slug: "about",
    seo_title: "About Agustin Gonzalez Nicolini — Engineering Leadership Coach",
    seo_description: "Meet Agustin Gonzalez Nicolini — engineering leader turned coach in Berlin. 15+ years scaling teams across fintech, gaming, e-mobility, and Web3.",
    body: [{
      component: "about_block",
      heading: "From Haedo to Berlin, One Engineering Team at a Time",
      image_alt: "Agustin Gonzalez Nicolini — engineering leadership coach in Berlin",
      footnote: "Based in Berlin — coaching engineering leaders remotely worldwide, in English, Spanish, or German.",
      show_section: true,
      paragraphs: [
        ti("I'm Agustin Gonzalez Nicolini. For 15+ years I've built and led multi-disciplinary teams across fintech, gaming, e-mobility, healthtech, and web3 — shipping REST and GraphQL architectures on serverless and containerized cloud-native systems, including a core banking platform."),
        ti("I advise C-suite and senior engineering leaders on cloud-native systems, DevOps transformation, and security — and I've likely sat through a version of whatever you're facing: the reorg, the audit, the outage review, the budget fight. Whether you're taking a startup through scale-up or restoring delivery discipline in an enterprise org, we build the systems and habits that let your team deliver without you as the bottleneck."),
      ],
    }],
  },
  {
    slug: "philosophy",
    seo_title: "Engineering Leadership Coaching Philosophy",
    seo_description: "How I coach engineering leaders: clarity over noise, systems over heroics, and empathy that scales. The principles behind every session.",
    body: [
      {
        component: "philosophy_block",
        heading: "My Coaching Philosophy",
        subheading: "Three pillars behind every engagement — and what each one changes for your team",
        show_section: true,
        principles: [
          { component: "principle_item", icon: "Lightbulb", color: "accent", title: "Growth through Clarity", description: "Clear goals, working feedback loops, and OKRs that tie each person's growth to business results — so your team knows exactly what winning looks like this quarter." },
          { component: "principle_item", icon: "Cog", color: "primary", title: "Empowerment through Systems", description: "DevOps/GitOps workflows, DORA metrics, and decision frameworks that let your team move fast without waiting on you." },
          { component: "principle_item", icon: "Heart", color: "accent", title: "Leadership through Empathy", description: "Psychological safety, deliberate mentoring, and a culture people choose to stay in. Retention is a leadership outcome, not an HR metric." },
        ],
      },
      {
        component: "how_i_work_block",
        heading: "How I Work",
        show_section: true,
        values: [
          { component: "value_item", icon: "Target", title: "Outcomes Over Optics", description: "Every engagement names the result it should produce — delivery speed, retention, uptime — and we check that it did." },
          { component: "value_item", icon: "ShieldCheck", title: "Security by Default", description: "Resilience and compliance as design inputs, not afterthoughts — a habit from years of PCI-DSS, SOC 2, and ISO 27001 work." },
          { component: "value_item", icon: "MessagesSquare", title: "Direct, Kind Feedback", description: "You'll hear what I actually think, specifically and early. That candor is most of the value." },
          { component: "value_item", icon: "Wrench", title: "Practice Over Theory", description: "I only teach what I've run in production with real teams — no borrowed frameworks." },
        ],
      },
    ],
  },
  {
    slug: "services",
    seo_title: "Engineering Leadership Coaching — CTO, VP & Manager",
    seo_description: "One-on-one coaching for CTOs, VPs, directors, and engineering managers — executive coaching, delivery and team coaching, and IC-to-manager programs.",
    body: [
      {
        component: "services_block",
        heading: "Coaching Services",
        subheading: "Three formats. Pick by the problem you have, not the title you hold.",
        bottom_prompt: "Not sure which format fits your situation?",
        show_section: true,
        services: [
          {
            component: "service_item", title: "Executive Leadership Coaching", subtitle: "CTO & VP Level",
            description: "For leaders accountable to boards and founders: an org design that scales, stakeholders who trust you, and decisions you can defend under pressure.",
            format: "Bi-weekly 60-minute sessions", best_for: "CTOs, VPs, and senior engineering executives", featured: false,
            features: [ti("Stakeholder influence & C-suite communication"), ti("Organization design & scaling strategies"), ti("Technology roadmap alignment with business goals"), ti("Board presentations & executive presence"), ti("Vendor management & strategic partnerships")],
          },
          {
            component: "service_item", title: "Team & Manager Coaching", subtitle: "Manager & Director Level",
            description: "For managers whose teams should be shipping more than they are: better delivery numbers, healthier rituals, and calmer on-call weeks.",
            format: "Weekly or bi-weekly 45-minute sessions", best_for: "Engineering managers, directors, and team leads", featured: true,
            features: [ti("DORA metrics & deployment velocity optimization"), ti("Team rituals, retrospectives & continuous improvement"), ti("Hiring, leveling & performance frameworks"), ti("Incident readiness & on-call culture"), ti("DevOps/GitOps workflows & trunk-based development")],
          },
          {
            component: "service_item", title: "Career Transition Coaching", subtitle: "IC to Manager & Beyond",
            description: "For engineers and managers moving up a level: land the role, then grow into it faster than you would alone.",
            format: "8-12 week programs with weekly check-ins", best_for: "Engineers and managers at career inflection points", featured: false,
            features: [ti("IC → Manager: First-time leadership transitions"), ti("Manager → Director: Scaling impact through others"), ti("Director → VP: Strategic thinking & executive presence"), ti("Career clarity & personal brand development"), ti("Interview prep for leadership roles")],
          },
        ],
      },
      {
        component: "testimonials_block",
        heading: "Typical Engagements",
        subheading: "Three composite sketches — not client quotes — showing the problems leaders bring me and how the work tends to unfold",
        note: "Coaching conversations are confidential by default, so named endorsements will only ever appear here with a client's explicit sign-off.",
        show_section: true,
        engagements: [
          { component: "engagement_item", role: "Senior Engineering Manager", context: "FinTech scale-up", sketch: "The first call was about messy deploys. Within six months the pipeline was boring — in the best way — but the more useful work was getting them out of the middle of every decision their team makes." },
          { component: "engagement_item", role: "First-Time Engineering Manager", context: "E-Commerce Platform", sketch: "A few months into the role and drowning. Instead of handing over a framework, we rehearsed the conversations they were avoiding — delegation, feedback, saying no — until having them for real felt routine." },
          { component: "engagement_item", role: "VP of Engineering", context: "B2B SaaS Company", sketch: "One team became four in a year and everything got slower — it usually does. We sketched an org structure early on, then stress-tested and adjusted it over the following quarters as the company kept growing." },
        ],
      },
    ],
  },
  {
    slug: "impact",
    seo_title: "Experience & Impact — Engineering Leadership Coaching",
    seo_description: "My track record leading engineering orgs — and the results coaching delivers: faster delivery, lower attrition, and teams that run without heroics.",
    body: [{
      component: "impact_block",
      timeline_heading: "Experience Timeline",
      stats_heading: "Numbers I Stand Behind",
      stats_subheading: "Results from teams I've led as an operator — the same playbooks we'll work from",
      show_section: true,
      timeline: [
        { component: "timeline_item", period: "2025-Present", company: "Confidential (Web3)", role: "Head of Infrastructure & Security", achievement: "Running infrastructure and security end to end for a Web3 platform — the company's name stays confidential for now." },
        { component: "timeline_item", period: "2022-2025", company: "JUCR GmbH (EV Charging)", role: "VP of Engineering", achievement: "Led the migration to multi-account AWS, unified an architecture spanning 5+ SaaS services, and sustained 99.99% uptime." },
        { component: "timeline_item", period: "2020-2022", company: "Wildlife Studios (Gaming)", role: "Cloud Security Manager", achievement: "Kept security controls stringent while game teams shipped features at full speed." },
        { component: "timeline_item", period: "2018-2021", company: "Ualá (FinTech)", role: "DevOps Lead", achievement: "Delivered a core banking system on a fully serverless architecture, with PCI-DSS compliance and security hardening throughout." },
        { component: "timeline_item", period: "2014-2018", company: "Bdev (HealthTech)", role: "Infrastructure & Security Lead", achievement: "Migrated on-premise infrastructure to AWS and implemented SOC 2 and ISO 27001 compliance." },
      ],
      stats: [
        { component: "stat_item", icon: "TrendingDown", value: "40%", label: "Cloud Cost Reduction", description: "FinOps discipline plus hard-nosed vendor negotiations — money back into the roadmap" },
        { component: "stat_item", icon: "Shield", value: "99.99%", label: "System Uptime", description: "Multi-region failover and DR/HA playbooks, built so a bad day in one region stays invisible to users" },
        { component: "stat_item", icon: "Rocket", value: "3×", label: "Faster Releases", description: "Trunk-based development, CI/CD, and GitOps — releasing became routine, not an event" },
        { component: "stat_item", icon: "Zap", value: "75%", label: "Reduced Lead Time", description: "A multi-account AWS migration with deployments automated end to end" },
        { component: "stat_item", icon: "Users", value: "50%", label: "Team Velocity Boost", description: "OKRs paired with DORA metrics, used as working tools rather than dashboards" },
        { component: "stat_item", icon: "Target", value: "60%", label: "Faster Onboarding", description: "Standardized processes and documentation a new hire can follow on day one" },
      ],
    }],
  },
  {
    slug: "faq",
    seo_title: "Engineering Leadership Coaching FAQ — Agustin Gonzalez Nicolini",
    seo_description: "Answers on engineering leadership coaching — who I work with, what sessions cover, remote coaching, languages, and how to get started.",
    body: [{
      component: "faq_block",
      heading: "Frequently Asked Questions",
      subheading: "Practical answers on fit, format, and how we'd start",
      show_section: true,
      faqs: [
        { component: "faq_item", question: "Who is Agustin Gonzalez Nicolini?", answer: "I'm an engineering leader and leadership coach based in Berlin, Germany. I've led engineering teams at companies including Ualá, Wildlife Studios, JUCR, and Bdev; today I head infrastructure and security at a Web3 company and coach senior technology leaders one-on-one." },
        { component: "faq_item", question: "Who does Agustin coach?", answer: "I work with CTOs and VPs of Engineering, directors, engineering managers, tech leads, and individual contributors preparing for their first leadership role." },
        { component: "faq_item", question: "What does engineering leadership coaching cover?", answer: "Whatever stands between you and a team that delivers: scaling and org design, stakeholder and C-suite communication, delivery speed and DORA metrics, DevOps and GitOps workflows, hiring and performance frameworks, incident readiness, and executive presence." },
        { component: "faq_item", question: "Does Agustin coach remotely?", answer: "Yes. I'm based in Berlin and coach leaders remotely worldwide. Sessions run in English, Spanish, or German — whichever you think best in." },
        { component: "faq_item", question: "How do I start working with Agustin?", answer: "Book a free 30-minute intro call from this page or email me at info@agusgonzaleznic.com — no preparation needed. On that call we go through where you're stuck and whether coaching is the right tool; you'll leave with a concrete next step either way." },
      ],
    }],
  },
  {
    slug: "contact",
    seo_title: "Contact & Book a Session — Engineering Leadership Coaching",
    seo_description: "Book a free 30-minute intro call with Agustin Gonzalez Nicolini, or email me. Remote coaching for engineering leaders worldwide, in EN, ES, and DE.",
    body: [{
      component: "contact_block",
      heading: "What's the Hardest Part of the Job Right Now?",
      subheading: "Tell me in a few lines — a stalled team, a rough transition, a decision you keep circling. That's exactly what a first conversation is for.",
      get_in_touch_heading: "Get in Touch",
      response_time_heading: "Response Time",
      response_time_text: "I typically respond within 24 hours. For urgent inquiries, please mention it in your message.",
      discovery_call_heading: "Free Discovery Call",
      discovery_call_text: "The first 30 minutes are on me: a working session on your situation, not a sales pitch. If I'm not the right coach for the problem, I'll say so.",
      show_section: true,
    }],
  },
];

// ── Step 1: prime the translation cache from the current .po catalogs ─────────
function unquote(s) {
  let t = s.trim();
  if (t.startsWith('"')) t = t.slice(1);
  if (t.endsWith('"')) t = t.slice(0, -1);
  return t.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
}
function parsePo(text) {
  const map = new Map();
  for (const block of text.split(/\n\n/)) {
    let mode = null;
    const id = [];
    const str = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("msgid ")) { mode = "id"; id.push(unquote(line.slice(6))); }
      else if (line.startsWith("msgstr ")) { mode = "str"; str.push(unquote(line.slice(7))); }
      else if (line.startsWith('"')) (mode === "id" ? id : str).push(unquote(line));
    }
    if (id.length) map.set(id.join(""), str.join(""));
  }
  return map;
}
function primeCache() {
  const cache = loadCache(cachePath);
  const strings = [...new Set(PAGES.flatMap((p) => collectTranslatableStrings(p)))];
  let primed = 0;
  const missing = [];
  for (const locale of TARGET_LOCALES) {
    const po = parsePo(readFileSync(resolve(catalogsDir, `${locale}.po`), "utf8"));
    for (const en of strings) {
      const tr = po.get(en);
      if (tr && tr.trim()) { seedCache(cache, locale, en, tr, PAGE_CACHE_SALT); primed += 1; }
      else missing.push(`${locale}: ${en.slice(0, 55)}`);
    }
  }
  saveCache(cachePath, cache);
  console.log(`✓ cache primed: ${primed} entries (${strings.length} strings × ${TARGET_LOCALES.length} locales)`);
  if (missing.length) {
    console.warn(`  ⚠ ${missing.length} string(s) had no .po translation (will fall back / DeepL):`);
    for (const m of missing.slice(0, 12)) console.warn(`    - ${m}`);
  }
}

// ── Storyblok Management API ──────────────────────────────────────────────────
let TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body) {
  await sleep(250); // MAPI caps at 6 req/s
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Storyblok MAPI ${method} ${path} → ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  return res.status === 204 ? null : res.json();
}
const uid = () => randomUUID();
function addUids(node) {
  if (Array.isArray(node)) return node.map(addUids);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = addUids(v);
    if (out.component) out._uid = uid();
    return out;
  }
  return node;
}

async function ensureSchema() {
  const { components } = await api("GET", "/components?per_page=100");
  const byName = Object.fromEntries(components.map((c) => [c.name, c.id]));
  for (const [name, def] of Object.entries(COMPONENTS)) {
    const payload = { component: { name, ...def } };
    if (byName[name]) {
      await api("PUT", `/components/${byName[name]}`, payload);
      console.log(`✓ updated component ${name}`);
    } else {
      await api("POST", "/components", payload);
      console.log(`✓ created component ${name}`);
    }
  }
}

async function ensureStories() {
  const { stories } = await api("GET", "/stories?starts_with=pages&per_page=100");
  let folder = stories.find((s) => s.is_folder && s.slug === "pages");
  if (!folder) {
    folder = (await api("POST", "/stories", { story: { name: "Pages", slug: "pages", is_folder: true } })).story;
    console.log("✓ created folder pages/");
  }
  for (const page of PAGES) {
    const content = { component: "page", seo_title: page.seo_title, seo_description: page.seo_description, body: addUids(page.body) };
    const existing = stories.find((s) => !s.is_folder && s.full_slug === `pages/${page.slug}`);
    if (existing) {
      await api("PUT", `/stories/${existing.id}`, { story: { content }, publish: 0 });
      console.log(`✓ updated DRAFT story pages/${page.slug}`);
    } else {
      const name = page.slug.charAt(0).toUpperCase() + page.slug.slice(1);
      await api("POST", "/stories", { story: { name, slug: page.slug, parent_id: folder.id, content }, publish: 0 });
      console.log(`✓ created DRAFT story pages/${page.slug}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
primeCache();
TOKEN = process.env.STORYBLOK_MANAGEMENT_TOKEN;
if (!TOKEN) {
  console.warn("\n⚠ STORYBLOK_MANAGEMENT_TOKEN not set — cache primed only; skipped schema + stories (run via op).");
  process.exit(0);
}
try {
  await ensureSchema();
  await ensureStories();
  console.log("\n✓ Seed complete (all pages, DRAFT).");
} catch (err) {
  console.error(`\nseed-storyblok-pages: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

// Primes the page-translation cache from the committed Lingui .po catalogs, and,
// only when asked, writes the DRAFT `pages/<slug>` stories from the copy below.
//
// Priming is the default because it is the one job nothing else does: fetch-pages
// relies on it so every locale reproduces today's exact wording. It needs no
// token and touches no remote state.
//
//   node scripts/seed-storyblok-pages.mjs                  prime the cache only
//   op run --env-file ~/.env --no-masking -- \
//     node scripts/seed-storyblok-pages.mjs --write-stories also write drafts
//
// WHY WRITING IS OPT-IN. This file is a SECOND WRITER to content the CMS owns, and
// a second writer goes stale. Its timeline entry once still said the employer was
// confidential months after that changed, so a re-run would have pushed that back
// over the published story. Any copy edited in Storyblok, or anywhere else, has to
// be mirrored here or this script will undo it. Write only deliberately.
//
// It no longer touches the component SCHEMA at all. Terraform owns that
// (terraform/storyblok.tf, and docs/publishing-links.md names it as the source of
// truth), and this script's copy of it had already drifted: it was missing
// links_block and link_item, and its `page.body` whitelist omitted links_block, so
// the wholesale component PUT it used to perform would have de-whitelisted the
// Links Block from the Visual Editor and left the live schema disagreeing with
// Terraform state, surfacing as an unexplained diff in the next gated apply.
//
// SECURITY: the token is read from env only, sent in the Authorization header,
// never logged. A non-OK response never echoes the request.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCache, saveCache, seedCache, cachedTranslation, TARGET_LOCALES } from "./lib/deepl.mjs";
import { collectTranslatableStrings } from "./lib/page-translate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cachePath = resolve(__dirname, ".i18n-cache.json");
const catalogsDir = resolve(__dirname, "../src/i18n/catalogs");

const SPACE_ID = "288632938663524";
const API = `https://mapi.storyblok.com/v1/spaces/${SPACE_ID}`;
const PAGE_CACHE_SALT = "pages-v1"; // must match scripts/fetch-pages.mjs

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
    seo_title: "About Agustin Gonzalez Nicolini | Engineering Leadership Coach",
    seo_description: "Meet Agustin Gonzalez Nicolini: engineering leader turned coach in Berlin. 15+ years scaling teams across fintech, gaming, e-mobility, and Web3.",
    body: [{
      component: "about_block",
      heading: "From Haedo to Berlin, One Engineering Team at a Time",
      image_alt: "Agustin Gonzalez Nicolini, engineering leadership coach in Berlin",
      footnote: "Based in Berlin, coaching engineering leaders remotely worldwide, in English or Spanish.",
      show_section: true,
      paragraphs: [
        ti("I'm Agustin Gonzalez Nicolini. For 15+ years I've built and led multi-disciplinary teams across fintech, gaming, e-mobility, healthtech, and web3, shipping REST and GraphQL architectures on serverless and containerized cloud-native systems, including a core banking platform."),
        ti("I advise C-suite and senior engineering leaders on cloud-native systems, DevOps transformation, and security, and I've likely sat through a version of whatever you're facing: the reorg, the audit, the outage review, the budget fight. Whether you're taking a startup through scale-up or restoring delivery discipline in an enterprise org, we build the systems and habits that let your team deliver without you as the bottleneck."),
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
        subheading: "Three pillars behind every engagement, and what each one changes for your team",
        show_section: true,
        principles: [
          { component: "principle_item", icon: "Lightbulb", color: "accent", title: "Growth through Clarity", description: "Clear goals, working feedback loops, and OKRs that tie each person's growth to business results, so your team knows exactly what winning looks like this quarter." },
          { component: "principle_item", icon: "Cog", color: "primary", title: "Empowerment through Systems", description: "DevOps/GitOps workflows, DORA metrics, and decision frameworks that let your team move fast without waiting on you." },
          { component: "principle_item", icon: "Heart", color: "accent", title: "Leadership through Empathy", description: "Psychological safety, deliberate mentoring, and a culture people choose to stay in. Retention is a leadership outcome, not an HR metric." },
        ],
      },
      {
        component: "how_i_work_block",
        heading: "How I Work",
        show_section: true,
        values: [
          { component: "value_item", icon: "Target", title: "Outcomes Over Optics", description: "Every engagement names the result it should produce (delivery speed, retention, uptime), and we check that it did." },
          { component: "value_item", icon: "ShieldCheck", title: "Security by Default", description: "Resilience and compliance as design inputs, not afterthoughts: a habit from years of PCI-DSS, SOC 2, and ISO 27001 work." },
          { component: "value_item", icon: "MessagesSquare", title: "Direct, Kind Feedback", description: "You'll hear what I actually think, specifically and early. That candor is most of the value." },
          { component: "value_item", icon: "Wrench", title: "Practice Over Theory", description: "I only teach what I've run in production with real teams: no borrowed frameworks." },
        ],
      },
    ],
  },
  {
    slug: "services",
    seo_title: "Engineering Leadership Coaching | CTO, VP & Manager",
    seo_description: "One-on-one coaching for CTOs, VPs, directors, and engineering managers: executive coaching, delivery and team coaching, and IC-to-manager programs.",
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
        subheading: "Three composite sketches (not client quotes) showing the problems leaders bring me and how the work tends to unfold",
        note: "Coaching conversations are confidential by default, so named endorsements will only ever appear here with a client's explicit sign-off.",
        show_section: true,
        engagements: [
          { component: "engagement_item", role: "Senior Engineering Manager", context: "FinTech scale-up", sketch: "The first call was about messy deploys. Within six months the pipeline was boring (in the best way), but the more useful work was getting them out of the middle of every decision their team makes." },
          { component: "engagement_item", role: "First-Time Engineering Manager", context: "E-Commerce Platform", sketch: "A few months into the role and drowning. Instead of handing over a framework, we rehearsed the conversations they were avoiding (delegation, feedback, saying no) until having them for real felt routine." },
          { component: "engagement_item", role: "VP of Engineering", context: "B2B SaaS Company", sketch: "One team became four in a year and everything got slower; it usually does. We sketched an org structure early on, then stress-tested and adjusted it over the following quarters as the company kept growing." },
        ],
      },
    ],
  },
  {
    slug: "impact",
    seo_title: "Experience & Impact | Engineering Leadership Coaching",
    seo_description: "My track record leading engineering orgs, and the results coaching delivers: faster delivery, lower attrition, and teams that run without heroics.",
    body: [{
      component: "impact_block",
      timeline_heading: "Experience Timeline",
      stats_heading: "Numbers I Stand Behind",
      stats_subheading: "Results from teams I've led as an operator: the same playbooks we'll work from",
      show_section: true,
      timeline: [
        { component: "timeline_item", period: "2025-Present", company: "Safe Labs GmbH (Web3)", role: "Head of Infrastructure & Security", achievement: "Running infrastructure and security end to end for a Web3 platform." },
        { component: "timeline_item", period: "2022-2025", company: "JUCR GmbH (EV Charging)", role: "VP of Engineering", achievement: "Led the migration to multi-account AWS, unified an architecture spanning 5+ SaaS services, and sustained 99.99% uptime." },
        { component: "timeline_item", period: "2020-2022", company: "Wildlife Studios (Gaming)", role: "Cloud Security Manager", achievement: "Kept security controls stringent while game teams shipped features at full speed." },
        { component: "timeline_item", period: "2018-2021", company: "Ualá (FinTech)", role: "DevOps Lead", achievement: "Delivered a core banking system on a fully serverless architecture, with PCI-DSS compliance and security hardening throughout." },
        { component: "timeline_item", period: "2014-2018", company: "Bdev (HealthTech)", role: "Infrastructure & Security Lead", achievement: "Migrated on-premise infrastructure to AWS and implemented SOC 2 and ISO 27001 compliance." },
      ],
      stats: [
        { component: "stat_item", icon: "TrendingDown", value: "40%", label: "Cloud Cost Reduction", description: "FinOps discipline plus hard-nosed vendor negotiations: money back into the roadmap" },
        { component: "stat_item", icon: "Shield", value: "99.99%", label: "System Uptime", description: "Multi-region failover and DR/HA playbooks, built so a bad day in one region stays invisible to users" },
        { component: "stat_item", icon: "Rocket", value: "3×", label: "Faster Releases", description: "Trunk-based development, CI/CD, and GitOps: releasing became routine, not an event" },
        { component: "stat_item", icon: "Zap", value: "75%", label: "Reduced Lead Time", description: "A multi-account AWS migration with deployments automated end to end" },
        { component: "stat_item", icon: "Users", value: "50%", label: "Team Velocity Boost", description: "OKRs paired with DORA metrics, used as working tools rather than dashboards" },
        { component: "stat_item", icon: "Target", value: "60%", label: "Faster Onboarding", description: "Standardized processes and documentation a new hire can follow on day one" },
      ],
    }],
  },
  {
    slug: "faq",
    seo_title: "Engineering Leadership Coaching FAQ | Agustin Gonzalez Nicolini",
    seo_description: "Answers on engineering leadership coaching: who I work with, what sessions cover, remote coaching, languages, and how to get started.",
    body: [{
      component: "faq_block",
      heading: "Frequently Asked Questions",
      subheading: "Practical answers on fit, format, and how we'd start",
      show_section: true,
      faqs: [
        { component: "faq_item", question: "Who is Agustin Gonzalez Nicolini?", answer: "I'm an engineering leader and leadership coach based in Berlin, Germany. I've led engineering teams at companies including Ualá, Wildlife Studios, JUCR, and Bdev; today I head infrastructure and security at a Web3 company and coach senior technology leaders one-on-one." },
        { component: "faq_item", question: "Who does Agustin coach?", answer: "I work with CTOs and VPs of Engineering, directors, engineering managers, tech leads, and individual contributors preparing for their first leadership role." },
        { component: "faq_item", question: "What does engineering leadership coaching cover?", answer: "Whatever stands between you and a team that delivers: scaling and org design, stakeholder and C-suite communication, delivery speed and DORA metrics, DevOps and GitOps workflows, hiring and performance frameworks, incident readiness, and executive presence." },
        { component: "faq_item", question: "Does Agustin coach remotely?", answer: "Yes. I'm based in Berlin and coach leaders remotely worldwide. Sessions run in English or Spanish, whichever you think best in." },
        { component: "faq_item", question: "How do I start working with Agustin?", answer: "Book a free 30-minute intro call from this page or email me at info@agusgonzaleznic.com (no preparation needed). On that call we go through where you're stuck and whether coaching is the right tool; you'll leave with a concrete next step either way." },
      ],
    }],
  },
  {
    slug: "contact",
    seo_title: "Contact & Book a Session | Engineering Leadership Coaching",
    seo_description: "Book a free 30-minute intro call with Agustin Gonzalez Nicolini, or email me. Remote coaching for engineering leaders worldwide, in EN, ES, and DE.",
    body: [{
      component: "contact_block",
      heading: "What's the Hardest Part of the Job Right Now?",
      subheading: "Tell me in a few lines: a stalled team, a rough transition, a decision you keep circling. That's exactly what a first conversation is for.",
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
  const diverged = [];
  for (const locale of TARGET_LOCALES) {
    const po = parsePo(readFileSync(resolve(catalogsDir, `${locale}.po`), "utf8"));
    for (const en of strings) {
      const tr = po.get(en);
      if (!tr || !tr.trim()) {
        missing.push(`${locale}: ${en.slice(0, 55)}`);
        continue;
      }
      // ADDITIVE ONLY. This step exists so a first seed reproduces the wording
      // already shipping, and the header calls that "nothing changes day one".
      // That stopped being automatic once the cache started carrying post-edited
      // CMS translations of its own: re-running this used to overwrite them from
      // the catalogs, silently rewriting live copy (measured at 78 strings, 75 of
      // them French, on 2026-08-27). An existing entry is therefore left alone
      // and reported, so replacing one is always a deliberate act.
      const existing = cachedTranslation(cache, locale, en, PAGE_CACHE_SALT);
      if (existing !== undefined) {
        if (existing !== tr) diverged.push(`${locale}: ${en.slice(0, 48)}`);
        continue;
      }
      seedCache(cache, locale, en, tr, PAGE_CACHE_SALT);
      primed += 1;
    }
  }
  saveCache(cachePath, cache);
  console.log(`✓ cache primed: ${primed} new entries (${strings.length} strings × ${TARGET_LOCALES.length} locales)`);
  if (diverged.length) {
    console.warn(
      `  ⚠ ${diverged.length} string(s) already cached with different wording, left untouched.\n` +
        "    The cache is what ships. To adopt the catalog wording instead, delete those\n" +
        "    entries (or the locale) from scripts/.i18n-cache.json and re-run.",
    );
    for (const d of diverged.slice(0, 12)) console.warn(`    - ${d}`);
  }
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

const WRITE_STORIES = process.argv.includes("--write-stories");
if (!WRITE_STORIES) {
  console.log("\n✓ Cache primed. No story was written; pass --write-stories for that.");
  process.exit(0);
}

TOKEN = process.env.STORYBLOK_MANAGEMENT_TOKEN;
if (!TOKEN) {
  console.error("\n--write-stories needs STORYBLOK_MANAGEMENT_TOKEN (run it through op).");
  process.exit(1);
}
try {
  await ensureStories();
  console.log("\n✓ Drafts written (all pages, DRAFT).");
} catch (err) {
  console.error(`\nseed-storyblok-pages: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

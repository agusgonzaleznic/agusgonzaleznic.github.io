# Architecture & design decisions

This is the *why* document. The root [`README.md`](../README.md) says what the system
is; [`terraform/README.md`](../terraform/README.md) covers infra operations;
[`docs/publishing-a-post.md`](publishing-a-post.md) and
[`docs/publishing-links.md`](publishing-links.md) are authoring guides. This file
records the load-bearing design decisions and the non-obvious constraints a future
maintainer would otherwise rediscover the hard way. Each claim points at the code
that implements it — the code comment at the referenced spot usually carries the
full rationale.

## System map

```
                        ┌────────────────────────────────────────────┐
 Browser ──────────────▶│ CloudFront distribution (agusgonzaleznic.com)│
                        │  ├─ default ──▶ GitHub Pages (static dist/) │
                        │  └─ /api/*  ──▶ contact Lambda (via OAC)    │
                        └────────────────────────────────────────────┘
                                              │
                              SESv2 (DKIM-signed email to owner)
                              SSM (Turnstile secret) · DynamoDB (rate limits)

 Storyblok publish ──▶ webhook Lambda ──▶ deploy.yml dispatch ──▶ build ──▶ Pages ──▶ invalidation
 Build time: Storyblok CDA (content) + DeepL/Claude (translation) ──▶ dist/ × 6 locales
```

## Build pipeline

The build is a strict ordered chain (`package.json` → `build`):
`assert-no-client-secrets → fetch-blog → fetch-pages → build:client → build:server → prerender`.

- **Secret guard first.** `scripts/assert-no-client-secrets.mjs` hard-fails a
  production build if any `VITE_STORYBLOK_*` var exists, because Vite string-inlines
  every `VITE_` var into public JS. `vite dev` is exempt (Visual Editor preview).
  All *build-pipeline* CMS/translation tokens (fetch-blog / fetch-pages / DeepL /
  post-edit) are read via `process.env` and cannot be bundled. The one
  `import.meta.env` token read in client code — the Visual Editor preview token
  in `src/lib/storyblok.ts` — is exactly what the guard defends against.
- **Prerender is pure Node** (`scripts/prerender.mjs`): `renderToString` of the
  compiled SSR bundle injected into `dist/index.html` — no headless browser. It
  renders the cross product of `PUBLISHED_LOCALES × routes`, each with its own
  `<head>` (title/meta/canonical/hreflang/JSON-LD).
- **Fail-loud guards, no silent fallbacks.** An empty `<title>` aborts the build;
  head-injection uses `replaceExactlyOnce` so template drift breaks loudly instead
  of shipping a wrong head. `dist/index.html` doubles as the SPA client-routing
  shell, so the `route-head:start/end` marker block in `index.html` IS the homepage
  head and is wholly replaced for every other route — never put route-agnostic tags
  inside the markers.
- **Feeds are generated after prerender** (`scripts/generate-feeds.mjs`, invoked at
  the end of `prerender.mjs`) so they overwrite the copies Vite made from `public/`
  and receive the exact same route/locale set — one source of truth. Standalone
  runs need both `dist/` and `dist-server/` built: the script imports the compiled
  server entry for `PUBLISHED_LOCALES` so feeds can't desync from `src/i18n`.
- **Precompression.** `vite-plugin-compression` writes `.gz`/`.br` siblings (>1 KB);
  prerender re-compresses every HTML file it injects — the client build precompressed
  the *pre-injection* shell, so skipping this would ship stale empty-shell bytes to
  any negotiated-encoding client.
- **react-helmet's singleton must be drained** (`Helmet.renderStatic()` after every
  `renderToString`, `src/entry-server.tsx`) or one route's head leaks into the next
  render. Safe only because the prerender loop is sequential and single-process.

## CMS at build time

Blog posts *and* all marketing pages live in Storyblok and are fetched at build
time (`scripts/fetch-blog.mjs`, `scripts/fetch-pages.mjs` — deliberately parallel
architectures). Content is baked into `src/generated/*.json` (gitignored); the
running site makes zero CMS requests.

- **Graded failure modes:** token missing → empty blog / fallback marketing copy,
  warning, exit 0 (this is what lets PR CI build without secrets); token present
  but invalid/API down → loud failure. CI deploys set `STORYBLOK_REQUIRE_TOKEN=1`
  so production can never silently ship the empty-blog variant.
- **Marketing pages have hardcoded fallback copy**: `src/lib/pages.ts` supplies
  the null-return mechanism, and the fallback copy itself lives in the section
  components at `src/components/*.tsx` (each headed "Hardcoded fallback — also
  the seed source for Storyblok"). The site is never blank, even with Storyblok
  gone. (`src/components/storyblok/*` are the CMS block renderers for the
  Visual Editor preview — no fallback copy there.)
- **Pagination pins the first page's `cv`** on subsequent pages for a consistent
  snapshot (`scripts/lib/storyblok-fetch.mjs`), and CDA error messages never echo
  the URL because the token rides in the query string.
- **`storyblok-fetch.mjs` is shared** by the build and the review tool so the
  post/page shape a reviewer approves can never drift from the shape the build serves.
- **Storyblok datetimes are zone-less UTC strings** (`YYYY-MM-DD HH:mm`). Every
  consumer must append the `Z`/offset itself (`scripts/generate-feeds.mjs`,
  `src/lib/blog.ts`); a bare `new Date()` would shift dates by machine timezone.
- **RSS `pubDate` uses the authored `published_date`; the sitemap's `lastmod` uses
  Storyblok's `published_at`** — deliberate: Storyblok bumps `published_at` on every
  re-publish, which is exactly what "last modified" wants and exactly what an RSS
  publish date doesn't.

## i18n

Six locales: English (source) at the root, `de/es/fr/it/pt` under `/{locale}/`
prefixes. English keeps the existing URLs and their authority and serves as
hreflang `x-default`. The full URL model lives in `src/i18n/locales.ts`.

- **Two-level publish gating.** `PUBLISHED_LOCALES` (`src/i18n/locales.ts`) is the
  coarse site-wide switch iterated by prerender, sitemap, hreflang, and the language
  switcher. Per-article, `scripts/lib/blog-gate.mjs` is the single source of policy:
  **DE/ES are review-gated** — a variant is emitted only when human-approved in
  `content/i18n-approvals.json` *and* the stored `sourceHash` still matches the
  English source (editing English auto-demotes the translation until re-reviewed);
  **FR/IT/PT auto-translate** at build and carry a machine-translation disclosure.
  `AUTO_LOCALE_MODE` is a one-line per-locale kill switch back to English.
  Marketing pages mirror this at whole-page granularity (`scripts/lib/page-gate.mjs`).
- **hreflang reciprocity.** An article's `approved_locales` drives all three of:
  which `/{locale}/` variants prerender emits, which hreflang alternates each
  variant advertises, and which sitemap entries exist — so no URL is ever advertised
  that isn't actually served, and every alternate set is reciprocal.
- **Translation pipeline** (two stages, heavily cached):
  1. **DeepL** with do-not-translate protection: ICU placeholders, `<0>`-style tags,
     URLs, emails, and glossary terms (`scripts/i18n-glossary.json`) are masked into
     `<x>N</x>` sentinels (`tag_handling=xml`), restored afterwards — markup and
     brand nouns stay byte-identical. Glossary matching is case-sensitive and
     whole-token (hence both `Ualá` and `Uala` are listed).
  2. **Claude post-edit** (`scripts/lib/llm-postedit.mjs`) enforces the site voice.
     The *entire voice standard lives in that prompt* — informal register (de du,
     Argentine voseo, fr/it/pt tu), first-person masculine, English loanwords kept,
     imperative CTAs but infinitive functional UI controls (de/fr/pt), profanity and
     foreign quotes preserved verbatim, per-language quote-mark conventions.
     Fail-safe by three independent guards (no key / API error / per-string
     placeholder-multiset validation) — degradation is always raw DeepL, never a
     broken string.
  - **Content-hash cache** (`scripts/.i18n-cache.json`, *committed*): keyed by
    `sha256(source + salt)` per locale, shared by PO catalogs, blog richtext, and
    pages. Unchanged English never re-translates; changed English auto-misses.
    Post-edited entries live under a different salt (`POSTEDIT_VERSION`) than raw
    DeepL, so enabling `ANTHROPIC_API_KEY` upgrades output automatically.
    `REGEN_LOCALES=<csv>` drops one locale's cache (the sanctioned re-translate).
    The global re-translate is a `POSTEDIT_VERSION` bump (or clearing the cache
    file) — so don't bump it for a single-locale prompt fix, it regenerates
    *every* locale. `FORCE_RETRANSLATE=1` (`translate.mjs` only) merely skips
    adopting existing catalogs into the cache; alone it changes almost nothing,
    it's meaningful only alongside a version bump.
  - **DeepL quota exhaustion (HTTP 456) mid-build does not fail the deploy**: the
    remaining misses are translated by Claude directly (or fall back to English
    without a key), with a CI `::warning` reporting usage. Any other DeepL error
    still fails loudly.
- **`translate.mjs` (Lingui catalogs) is deliberately not in CI.** Committed `.po`
  files are the source of truth; the local review app writes reviewed `msgstr`
  straight into them, which is safe *because* no automation ever rewrites them.
- **PUBLISHED_LOCALES is regex-parsed from `locales.ts` source text** by the build
  scripts (they run before TS compiles); a mirror constant would be a desync hazard.
  Parse failure fails the build rather than silently translating nothing.
- **Review is local** (`scripts/review-translations.mjs`, one web app over pages +
  blog + UI strings) because in-Storyblok review would need field-level i18n the
  current plan doesn't allow. Approvals are `sourceHash`-stamped so CI machine
  translation can never overwrite a human review.
- **Nav locale persistence**: `<LocaleLink>` + `useLocalizedTo` derive the active
  locale from the URL prefix and re-prefix every internal link — the fix for the
  classic "internal links drop the locale" bug class.
- **Dates render via hand-rolled per-locale month tables** (`src/lib/blog.ts`), not
  `Intl.DateTimeFormat`, so output can't vary with the runtime's ICU version
  (deterministic across Node versions and browsers).
- **The route table lives once** (`AppRoutes` in `App.tsx`; `entry-server.tsx`
  imports it). Each side carries a page-component *map* — eager `serverPages`
  (`renderToString` is synchronous) vs lazy `clientPages` — with key parity
  enforced by the shared `RoutePages` type. The genuinely unenforced sync is
  `AppRoutes` ↔ the `routes` array in `scripts/prerender.mjs`: add a route to
  one without the other and no static page is emitted.

## SEO / GEO

- **Real 404s, no SPA 200-fallback.** Every real route has its own
  `/path/index.html`; one `dist/404.html` (rendered in the source locale, robots
  `noindex`, no canonical/hreflang, absent from the sitemap) is served with a real
  HTTP 404 for unknown paths — `terraform/cdn.tf` `custom_error_response` and GitHub
  Pages both use it natively. This is what keeps prerendered SSG out of Search
  Console's soft-404 bucket.
- **Canonical policy.** Trailing-slash policy differs by subtree: blog paths carry a
  trailing slash, marketing/legal pages don't (`scripts/prerender.mjs`); the
  CloudFront function enforces the matching canonicalization on the locale-stripped
  path (`terraform/cdn.tf`). Adding a route means picking the right side of both.
  Blog `canonical_override` is CMS-editable and therefore accepted only when it
  matches `^https://` — an editor cannot break canonicals with a typo.
- **JSON-LD entity model** (`src/components/SeoPage.tsx`): compact Person/WebSite
  nodes are embedded in every page's `@graph` under the *same* `@id`
  (`#person`/`#website`) as the rich homepage nodes, so crawlers merge them into one
  entity instead of seeing per-page duplicates.
- **GEO stance**: `public/robots.txt` explicitly allow-lists the major AI crawlers
  and points them at `/llms.txt`; `llms.txt` is generated per locale
  (`dist/llms.txt`, `dist/{locale}/llms.txt`), with the blog section spliced before
  `## Optional` (llmstxt.org convention) and an English-brief fallback for locales
  without a translated brief in `public/{locale}/llms.txt`.
- **Language switcher is crawlable-first**: real `<a>` anchors to every locale's
  prerendered URL are always in the DOM (only visually hidden in the dropdown).

## Contact form security

`/api/contact` is a Lambda behind CloudFront via OAC (same-origin — no third-party
script at page load, no CORS relaxation). `terraform/contact-lambda-src/index.mjs`
runs **ten anti-abuse controls in order** (method gate → CORS allowlist →
body-size cap → schema validation → honeypot → per-IP + global burst limits
**before** the outbound Turnstile siteverify → token age / minimum-form-time /
replay checks, which derive from Turnstile's `challenge_ts` and so can only run
after it → per-email rate limit → duplicate suppression) and then emails the
owner **directly via SESv2** with
`Reply-To` set to the submitter. Rate-limit state lives in DynamoDB; the Turnstile
secret in SSM. Delivery failure is fail-closed (502) with a structured log.

Mail authentication is part of the design, not an afterthought: the SES identity
uses Easy DKIM (2048-bit) plus a custom MAIL FROM subdomain
(`mail.agusgonzaleznic.com`) so DMARC (`p=reject`, `adkim=s`) passes on both DKIM
and SPF — while the apex SPF stays Google-only (scoping `include:amazonses.com` to
the `mail.*` subdomain avoids authorizing every SES customer to spoof the apex).
Full rationale in `terraform/ses.tf` and `terraform/dns.tf`.

## CI/CD

Three workflows, all with SHA-pinned actions and `persist-credentials: false`:

- **`ci.yml` — skip-job/required-check pattern.** The workflow always runs (no
  top-level paths filter); a cheap `changes` job decides whether the site can be
  affected, `build` runs only then, and `CI required` (`if: always()`) is the single
  branch-protection check. This avoids the deadlock where a paths-filtered required
  workflow never reports. Change detection is a **fail-safe denylist** (build unless
  every changed file is ignorable). ⚠️ The ci.yml and deploy.yml denylists are
  hand-synced — nothing enforces it (and they deliberately differ by one entry:
  deploy.yml also ignores ci.yml itself).
- **`deploy.yml`** — push-to-main with `paths-ignore` (same fail-safe direction);
  `workflow_dispatch` (the Storyblok rebuild target) is exempt from paths filters by
  GitHub semantics. Post-deploy CloudFront invalidation exists because Pages serves
  `max-age=600`; it runs under a **dedicated OIDC role** that can only create
  invalidations (also trusted by `agusgonzaleznic/drive-berlin`, which shares the
  distribution) and *waits* for completion — a green run means the cache is clear.
  Build credentials are classified by nature: public-by-design values are repo
  *variables*; DeepL/Anthropic/Storyblok tokens are *secrets*, deliberately
  non-`VITE_` so they can't be inlined. Every one degrades gracefully when unset.
- **`terraform.yml` — two tiers, one run.** Site module: PR plan with a sticky
  comment (redact-then-post secret scrub that *fails the job* when it redacts
  something), gated apply (`terraform-production`) that plans and applies the same
  saved plan in one job. Bootstrap tier (state bucket + all IAM): read-only PR plan,
  change detection **by plan** (`-detailed-exitcode`, not paths — a path filter both
  over-prompts and misses drift), gated apply (`terraform-bootstrap`) chained
  **ahead of** the site apply, because it grants the permissions the site plan is
  about to use. The site apply's `!failure() && !cancelled()` condition is
  load-bearing: bootstrap-apply is *skipped* on no-change merges and a skipped need
  must not skip the apply. Full design + the rejected alternatives in
  [`terraform/bootstrap/README.md`](../terraform/bootstrap/README.md) and the essay
  at the top of `terraform/bootstrap/role-bootstrap-ci.tf`.
- **Names are load-bearing outside the repo**: the `CI required` job name (branch
  protection), the `terraform-production` / `terraform-bootstrap` environment names
  (OIDC trust subjects), and the required reviewer on `terraform-bootstrap` — which
  is the *only* control over an admin-equivalent role.

## Hand-synced pairs & other traps

Things with no enforcing check — change one, change the other:

| This | Must match | Where |
|---|---|---|
| `AUTO_LOCALES` | `AUTO_TRANSLATED_LOCALES` (MT disclosure) | `scripts/lib/blog-gate.mjs` ↔ `src/i18n/locales.ts` |
| `PAGE_NON_TEXT` (review app) | `NON_TEXT_FIELDS` (translator + hash) | `scripts/review-translations.mjs` ↔ `scripts/lib/page-translate.mjs` |
| `PAGE_CACHE_SALT` (`pages-v1`) | same constant in the seeder | `scripts/fetch-pages.mjs` ↔ `scripts/seed-storyblok-pages.mjs` |
| PO serializer | byte-identical duplicate | `scripts/lib/po.mjs` ↔ inline copy in `scripts/translate.mjs` |
| Claude model id | three hardcoded copies | `llm-postedit.mjs`, `proofread.mjs`, `tag-i18n.mjs` |
| ci.yml denylist | deploy.yml `paths-ignore` (±ci.yml itself) | `.github/workflows/` |
| Route table (`AppRoutes`) | `routes` array | `src/App.tsx` ↔ `scripts/prerender.mjs` |
| `MAX_BODY_BYTES` (client) | `MAX_BODY_BYTES` (Lambda) | `src/components/Contact.tsx` ↔ `terraform/contact-lambda-src/index.mjs` |

And the traps that aren't pairs:

- `gtag()` must stay a `function` pushing the live `arguments` object — gtag.js
  silently ignores plain-array pushes; a refactor to rest parameters kills analytics
  with no error (`src/lib/analytics.ts`).
- Lingui message ids encode the `<Trans>` element structure: restructuring a
  translated component's JSX silently re-keys the id and forces a fresh MT pass for
  that string — wording can drift with unchanged English. Re-check affected strings
  after JSX restructuring.
- `translate.mjs` *adopts* every non-empty `msgstr` into the cache as reviewed
  truth — a wrong hand-edit to a target catalog persists until the English source
  changes or the cache entry is cleared.
- Deleting a reviewed translation file without demoting its
  `content/i18n-approvals.json` entry fails the next build loudly (by design).
- `getPost()` falls back to the English post for unapproved locale variants on
  *client-side* navigation only — prerender never emits such a page.
- Storyblok MAPI caps at 6 req/s — the seeder throttles; `new-post.mjs` doesn't
  (fine at its call volume, a hazard in loops). Its blog-folder lookup reads one
  `per_page=100` page — no pagination.
- `src/generated/*.json` must exist at build time (eager `import.meta.glob`): a bare
  `vite build` on a fresh clone fails; missing per-locale files mean silent English
  fallback, not an error.

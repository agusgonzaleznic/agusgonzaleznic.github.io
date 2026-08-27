# agusgonzaleznic.com

Personal site of Agustin Gonzalez Nicolini, engineering-leadership coaching. A prerendered React single-page app served as static files from GitHub Pages behind a CloudFront CDN, published in six languages, with a CMS-driven blog and marketing pages, a bot-hardened contact form, and consent-gated analytics. Infrastructure and CI are managed as code.

**Live:** https://agusgonzaleznic.com

Design rationale, the *why* behind the decisions below, lives in [`docs/architecture.md`](docs/architecture.md).

---

## How it fits together

```
Browser ──▶ CloudFront (agusgonzaleznic.com)
              ├─ default behavior ─▶ GitHub Pages (static site, this repo)
              └─ /api/* ───────────▶ Lambda (contact form) via OAC ──▶ SESv2 email to owner
                                       └─ SSM (secrets) + DynamoDB (rate limits)

Storyblok (CMS) ──publish webhook──▶ Lambda ──▶ GitHub Actions (rebuild) ──▶ Pages ──▶ CloudFront invalidation
Build time: Storyblok (content) + DeepL/Claude (translation pipeline) ──▶ static HTML × 6 locales
```

- **Static-site generation.** `vite build` (client) + an SSR build (`src/entry-server.tsx`) feed `scripts/prerender.mjs`, which renders every route **per published locale** to static HTML so crawlers and AI engines see full content without running JS. Each route gets its own `<head>` (title/meta/canonical/hreflang/JSON-LD) via `react-helmet`. Unknown paths get a real HTTP 404 (`dist/404.html`); there is deliberately no SPA 200-fallback.
- **Content from a CMS, safely.** Blog posts *and* all marketing pages live in Storyblok and are fetched **at build time** (`scripts/fetch-blog.mjs`, `scripts/fetch-pages.mjs`): the CMS token is a build-only environment variable and never reaches the browser bundle. Marketing pages fall back to hardcoded copy when no token is present. A Storyblok publish fires a webhook that triggers a rebuild.
- **Six languages.** English at the root; `de`/`es`/`fr`/`it`/`pt` under `/{locale}/` path prefixes. UI strings go through Lingui catalogs; CMS content is machine-translated at build time (DeepL + a Claude voice post-edit) behind a review gate: DE/ES publish only human-reviewed translations, FR/IT/PT auto-publish with a machine-translation disclosure. See [`docs/architecture.md`](docs/architecture.md#i18n) and [`docs/publishing-a-post.md`](docs/publishing-a-post.md).
- **Hardened contact form.** Submissions POST to a same-origin `/api/contact` endpoint (a Lambda behind CloudFront via OAC) that runs ten ordered server-side anti-abuse controls: method gate, CORS allowlist, body-size cap, schema validation, and honeypot first; per-IP and global burst limits **before** the outbound Turnstile siteverify call (so bots can't saturate it); then token age / minimum-form-time / replay checks (computed from Turnstile's `challenge_ts`, so they can only run after verification), a per-email rate limit, and duplicate suppression. It then emails the owner directly via SESv2, no third-party relay. No third-party script loads at page load.
- **Consent-first analytics.** Analytics is off by default and loads only after explicit opt-in; the privacy notice reflects the site's actual behavior.
- **Infrastructure as code.** DNS, TLS, CDN, SES, and the serverless pieces are defined in Terraform (`terraform/`) and applied through gated CI pipelines, including the IAM/bootstrap tier itself. See [`terraform/README.md`](terraform/README.md).

## Tech stack

- **Vite 7** + **React 18** + **TypeScript 5** (SWC).
- **Tailwind CSS 3** with **shadcn/ui** (Radix primitives), **lucide-react** icons.
- **React Router 6** for routing; **react-helmet** for per-route metadata; **Lingui 6** for i18n.
- **@storyblok/react** for CMS content.
- **ESLint 9** + **Husky** + **lint-staged** (pre-commit lint).
- Fonts are self-hosted (`public/fonts/`) with `font-display: optional`, so there are no external font requests and no layout shift.

## Local development

Requires Node.js 22.

```bash
npm install
npm run dev        # dev server at http://localhost:8080 (runs fetch-blog + fetch-pages first)
```

The blog is empty and marketing pages use fallback copy locally unless a Storyblok read token is provided (see below); everything else runs without any secrets.

### Scripts

```bash
npm run dev        # dev server (predev runs fetch-blog + fetch-pages)
npm run build      # full production build (see the chain below)
npm run preview    # serve the built dist/ locally
npm run lint       # ESLint
npm run i18n:extract && npm run i18n:compile   # Lingui catalog maintenance
```

`npm run build` runs, in order:

1. `assert-no-client-secrets` fails the build if a `VITE_STORYBLOK_*` var is present (guard against inlining a CMS token into the public bundle).
2. `fetch-blog` pulls published blog posts from Storyblok into `src/generated/`, machine-translating them per published locale (review-gated for DE/ES, automatic for FR/IT/PT).
3. `fetch-pages` does the same for the Storyblok-managed marketing pages (with hardcoded fallback copy when no token is set).
4. `build:client` + `build:server` are the Vite client and SSR builds.
5. `prerender` renders every route × published locale to static HTML and generates `sitemap.xml` (with hreflang alternates), the blog RSS feed, a real `404.html`, and per-locale `llms.txt`.

### Environment variables (all optional for local dev)

| Variable | Purpose | Notes |
|---|---|---|
| `STORYBLOK_PUBLIC_TOKEN` | Build-time CMS read | **Never** `VITE_`-prefixed: build-time only, never bundled. CI sets `STORYBLOK_REQUIRE_TOKEN=1` so production can never ship an empty blog. |
| `STORYBLOK_VERSION=draft` | Preview unpublished posts locally | Optional; needs a preview token. |
| `DEEPL_API_KEY` | Machine translation (build-time) | Non-`VITE_` by design. Empty → auto translation is skipped entirely: FR/IT/PT ship English (the cache is only consulted with a key); reviewed DE/ES are unaffected. |
| `ANTHROPIC_API_KEY` | Claude voice post-edit on translations | Non-`VITE_` by design. Empty → raw DeepL output. |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile widget (public site key) | Public by design. Empty → contact form shows an email fallback. |
| `VITE_GA_MEASUREMENT_ID` | Enable consent-gated analytics | Public by design. Empty → analytics fully disabled. |
| `VITE_HTTPS=true` | mkcert HTTPS dev server | Only needed for the Storyblok Visual Editor preview. |

Provide them inline or via your own secrets manager. **Do not commit real values.**

## Deployment & CI

Three GitHub Actions pipelines (all third-party and reusable workflows are pinned by commit SHA):

- **`ci.yml`**: on PRs, lints and builds the site (only when site files changed, via a skip-job pattern) and reports a single required status check.
- **`deploy.yml`**: on push to `main` (site paths only) and on the Storyblok rebuild webhook: builds all locales, deploys to GitHub Pages, and invalidates the CloudFront cache so changes are live immediately.
- **`terraform.yml`**: on PRs/merges touching `terraform/**`: two tiers. The site module plans on PRs (sticky comment) and applies behind the `terraform-production` gate; the bootstrap tier (state bucket + all IAM) plans read-only, detects changes by plan, and applies behind its own `terraform-bootstrap` gate, chained **ahead of** the site apply. See [`terraform/README.md`](terraform/README.md).

## Project structure

```
.
├── index.html               # Vite entry + static <head> (route-head markers, JSON-LD)
├── public/                  # static assets, self-hosted fonts, robots.txt, llms.txt
├── content/                 # review-gated translations: i18n-approvals.json, translations/,
│                            #   pages/, tag-translations.json (committed, human-reviewed)
├── docs/                    # authoring guides + architecture/design documentation
├── scripts/                 # build-time: fetch-blog, fetch-pages, prerender, generate-feeds,
│                            #   guards; authoring: new-post, review-translations, translate,
│                            #   translate-tags, seed-storyblok-pages; shared lib/
├── src/
│   ├── components/          # section components (Hero, About, …), blog/, storyblok/ (CMS
│   │                        #   blocks), ui/ (shadcn), LanguageSwitcher, LocaleLink, SeoPage
│   ├── pages/               # Index, About, Services, Philosophy, Impact, Faq, Contact, Blog,
│   │                        #   BlogPost, Links, Legal, StoryblokPage (CMS renderer), NotFound
│   ├── i18n/                # locales.ts (PUBLISHED_LOCALES gate), catalogs/ (.po), helpers
│   ├── lib/                 # analytics, blog, pages (CMS loaders), storyblok, turnstile, utils
│   ├── generated/           # build-time blog + page data, per locale (gitignored)
│   ├── entry-server.tsx     # SSR entry used by the prerenderer
│   └── App.tsx / main.tsx
├── lingui.config.ts         # extracts ALL locales; publishing is gated separately
├── terraform/               # infrastructure as code (see its own README; bootstrap/ = IAM tier)
└── .github/workflows/       # ci.yml, deploy.yml, terraform.yml
```

## Conventions

- **Every change ships via a PR.** CI must pass; `main` is protected.
- **Accessibility & SEO/GEO**: semantic HTML, per-route metadata, hreflang reciprocity, JSON-LD, and on-page FAQ text kept identical to its structured-data counterpart.
- **URLs stay clean:** bare paths, no lingering fragments; locale prefixes only for non-English.
- **No secrets in the repo, the bundle, build logs, or PR output.** This is a public repository; treat all output as world-readable.

## License

Private and proprietary. Content and branding © Agustin Gonzalez Nicolini.

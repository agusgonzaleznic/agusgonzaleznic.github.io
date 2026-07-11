# agusgonzaleznic.com

Personal site of Agustin Gonzalez Nicolini — engineering-leadership coaching. A prerendered React single-page app served as static files from GitHub Pages behind a CloudFront CDN, with a CMS-driven blog, a bot-hardened contact form, and consent-gated analytics. Infrastructure and CI are managed as code.

**Live:** https://agusgonzaleznic.com

---

## How it fits together

```
Browser ──▶ CloudFront (agusgonzaleznic.com)
              ├─ default behavior ─▶ GitHub Pages (static site, this repo)
              └─ /api/* ───────────▶ Lambda (contact form) via OAC

Storyblok (CMS) ──publish webhook──▶ Lambda ──▶ GitHub Actions (rebuild) ──▶ Pages ──▶ CloudFront invalidation
```

- **Static-site generation.** `vite build` (client) + an SSR build (`src/entry-server.tsx`) feed `scripts/prerender.mjs`, which renders each route to static HTML so crawlers and AI engines see full content without running JS. Each route gets its own `<head>` (title/meta/canonical/JSON-LD) via `react-helmet`.
- **Blog from a CMS, safely.** Blog posts live in Storyblok and are fetched **at build time** by `scripts/fetch-blog.mjs` — the CMS token is a build-only environment variable and never reaches the browser bundle. A Storyblok publish fires a webhook that triggers a rebuild, so the token is never exposed client-side and content still updates on publish.
- **Hardened contact form.** Submissions POST to a same-origin `/api/contact` endpoint (a Lambda behind CloudFront) that runs server-side anti-abuse controls (Cloudflare Turnstile verification, schema validation, rate limits, honeypot, duplicate suppression) before relaying the message. No third-party script loads at page load.
- **Consent-first analytics.** Analytics is off by default and loads only after explicit opt-in; the privacy notice reflects the site's actual behavior.
- **Infrastructure as code.** DNS, TLS, CDN, and the serverless pieces are defined in Terraform (`terraform/`) and applied through a gated CI pipeline. See [`terraform/README.md`](terraform/README.md).

## Tech stack

- **Vite 7** + **React 18** + **TypeScript 5** (SWC).
- **Tailwind CSS 3** with **shadcn/ui** (Radix primitives), **lucide-react** icons.
- **React Router 6** for routing; **react-helmet** for per-route metadata.
- **@storyblok/react** for CMS content.
- **ESLint 9** + **Husky** + **lint-staged** (pre-commit lint).
- Fonts are self-hosted (`public/fonts/`) with `font-display: optional` — no external font requests, no layout shift.

## Local development

Requires Node.js 22.

```bash
npm install
npm run dev        # dev server at http://localhost:8080
```

The blog is empty locally unless a Storyblok read token is provided (see below); everything else runs without any secrets.

### Scripts

```bash
npm run dev        # dev server (runs fetch-blog first)
npm run build      # full production build (see the chain below)
npm run preview    # serve the built dist/ locally
npm run lint       # ESLint
```

`npm run build` runs, in order:

1. `assert-no-client-secrets` — fails the build if a `VITE_STORYBLOK_*` var is present (guard against inlining a CMS token into the public bundle).
2. `fetch-blog` — pulls published blog posts from Storyblok into `src/generated/`.
3. `build:client` + `build:server` — Vite client and SSR builds.
4. `prerender` — renders each route to static HTML and generates `sitemap.xml`, the blog RSS feed, and `llms.txt`.

### Environment variables (all optional for local dev)

| Variable | Purpose | Notes |
|---|---|---|
| `STORYBLOK_PUBLIC_TOKEN` | Build-time CMS read | **Never** `VITE_`-prefixed — build-time only, never bundled. |
| `STORYBLOK_VERSION=draft` | Preview unpublished posts locally | Optional; needs a preview token. |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile widget (public site key) | Public by design. Empty → contact form shows an email fallback. |
| `VITE_GA_MEASUREMENT_ID` | Enable consent-gated analytics | Public by design. Empty → analytics fully disabled. |

Provide them inline or via your own secrets manager. **Do not commit real values.**

## Deployment & CI

Two GitHub Actions pipelines (reusable workflows are pinned by commit SHA):

- **`ci.yml`** — on PRs: lints and builds the site (only when site files changed) and reports a single required status check.
- **`deploy.yml`** — on push to `main` (site paths only) and on the Storyblok rebuild webhook: builds, deploys to GitHub Pages, and invalidates the CloudFront cache so changes are live immediately.
- **`terraform.yml`** — on PRs/merges touching `terraform/**`: plans (posting a summary on the PR) and applies through a gated environment. See [`terraform/README.md`](terraform/README.md).

## Project structure

```
.
├── index.html               # Vite entry + static <head> (route-head markers, JSON-LD)
├── public/                  # static assets, self-hosted fonts, robots.txt
├── scripts/                 # build-time: fetch-blog, prerender, generate-feeds, guards
├── src/
│   ├── components/          # sections, blog/, ui/ (shadcn), ScrollManager, CookieNotice
│   ├── pages/               # Index, Blog, BlogPost, Legal (Impressum/Privacy), NotFound
│   ├── lib/                 # analytics, layout constants, storyblok, utils
│   ├── generated/           # build-time blog data (gitignored)
│   ├── entry-server.tsx     # SSR entry used by the prerenderer
│   └── App.tsx / main.tsx
├── terraform/               # infrastructure as code (see its own README)
└── .github/workflows/       # ci.yml, deploy.yml, terraform.yml
```

## Conventions

- **Every change ships via a PR** — CI must pass; `main` is protected.
- **Accessibility & SEO/GEO**: semantic HTML, per-route metadata, JSON-LD, and on-page FAQ text kept identical to its structured-data counterpart.
- **URLs stay clean** — bare paths, no lingering fragments.
- **No secrets in the repo, the bundle, build logs, or PR output.** This is a public repository; treat all output as world-readable.

## License

Private and proprietary. Content and branding © Agustin Gonzalez Nicolini.

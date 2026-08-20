# Publishing a blog post

The one-page guide to going from a draft to a live, translated post — and what's
automated vs. what you do by hand.

## TL;DR

```
1. Write the article (Markdown or HTML).
2. Import it:   op run --env-file="$HOME/.env" --no-masking -- node scripts/new-post.mjs my-post.md
3. Review it in Storyblok, then click Publish.        → EN + FR/IT/PT go live (FR/IT/PT machine-translated)
4. Review DE/ES (and optionally FR/IT/PT) locally:   op run --env-file="$HOME/.env" --no-masking -- node scripts/review-translations.mjs
   → edit in the browser, Save, then:  git add content/ src/i18n/catalogs/ scripts/.i18n-cache.json && git commit -S && git push   → reviewed versions go live
```

That's it. Everything below is detail.

## What's automated vs. manual

| Step | Who |
|---|---|
| Markdown/HTML → Storyblok Richtext | **automated** (`new-post.mjs`) |
| Proofread the English source | **automated** (`new-post.mjs`, needs `ANTHROPIC_API_KEY`) |
| Suggest do-not-translate glossary terms | **automated** (`new-post.mjs`) |
| Generate + attach tags | **automated** (`new-post.mjs`) |
| Title/slug/date + excerpt/SEO metadata | **automated** (title from `# H1`, excerpt/SEO via Claude); frontmatter optional and overrides |
| Translate FR / IT / PT | **automated** at build (DeepL + Claude voice pass), ships immediately, disclosed as machine translation |
| Translate DE / ES | **automated** draft, but **gated** — not shown until you review + approve them |
| Review any language | **you**, in the local review app (`review-translations.mjs`) — no GitHub PRs |
| Publish / go live | **you**, in Storyblok (Publish) + `git push` for reviewed translations |

## Prerequisites

- Secrets come from 1Password via `op run --env-file="$HOME/.env" --no-masking -- <cmd>`.
- `~/.env` carries everything you need: `DEEPL_API_KEY`, `ANTHROPIC_API_KEY`,
  `STORYBLOK_MANAGEMENT_TOKEN` (importer), and `STORYBLOK_PUBLIC_TOKEN` — the
  review app **hard-requires** the public token and exits without it.
- All steps degrade gracefully without `ANTHROPIC_API_KEY` (proofread/tags skip;
  fresh machine translation is raw DeepL you then edit) — but since the key is in
  `~/.env`, the Claude-powered steps run locally by default. CI has its own copy
  for deploy builds.

## Step 1 — Write the article

Just write a Markdown or HTML file with a normal `# Title` heading and the body.
**No frontmatter needed** — the importer derives everything: title from the `# H1`,
slug from the title, `published_date` = today, and it generates the excerpt + SEO
fields + tags with Claude. You review it all in Storyblok afterward.

```markdown
# My Post Title

Body goes here…
```

Frontmatter is still **optional** — add a fence to override any auto-derived value
(and it's the only way to set a few things):

```yaml
---
slug: my-post                 # override the auto slug
excerpt: …                    # override the generated teaser / meta description (<=200)
seo_title: …                  # override (<=60)
seo_description: …            # override (<=160)
published_date: 2026-07-19 09:00
original_url:                 # attribution line only ("Originally published on Medium") — does NOT set the canonical
canonical_override:           # https:// URL; THIS is what points canonical/og:url elsewhere. Empty = self-canonical
tags:                         # comma-separated; empty = auto-suggested
---
```

- A leading `# H1` is dropped from the body (the `title` field owns the headline).
- **`canonical_override`** is the SEO lever: it alone controls the canonical /
  `og:url` / JSON-LD URL, and it's accepted only when it starts with `https://`
  (anything else = self-canonical). Set it **only** if the post was published
  somewhere else first — getting this wrong hands your SEO to another site.
- **`original_url`** does *not* affect the canonical. It renders an attribution
  line on the post whose link text is hardcoded to **"Medium"** — don't use it
  for non-Medium sources without changing `BlogPost.tsx` first.
- On an interactive import the importer prompts for any still-empty field
  (`original_url` is never auto-filled, so expect at least that prompt even with
  the Claude key present); `--no-prompt` or a non-TTY run skips prompting.
- Re-running the importer on an existing `blog/<slug>` **updates the draft in
  place** — the supported way to revise from the source file. It also overwrites
  any edits made directly in Storyblok since the last import.

## Step 2 — Import

```
op run --env-file="$HOME/.env" --no-masking -- node scripts/new-post.mjs my-post.md
```

This creates the **draft** story `blog/<slug>` in Storyblok and, along the way:

- converts the body to Richtext (headings, lists, links, blockquotes, code, images);
- **proofreads** the English source and offers to apply fixes;
- flags **glossary candidates** (acronyms/product names not in the do-not-translate list) to add;
- **suggests tags** (reusing existing ones) and attaches them;
- derives title/slug/date and generates excerpt + SEO (frontmatter overrides; interactive runs prompt for any still-empty field).

Flags: `--dry-run` (preview the Richtext — no *Storyblok* call, but proofread /
metadata generation still call Claude when the key is present), `--no-prompt`,
`--no-proofread`.

## Step 3 — Review in Storyblok and Publish

Open the draft in Storyblok, skim it, adjust anything (including tags), then
**Publish**. Publishing fires the rebuild webhook. On that build:

- **EN** goes live.
- **FR / IT / PT** are machine-translated and go live immediately (shown with a
  machine-translation disclosure).
- **DE / ES** do **not** appear yet — they're gated on your review (Step 4).

Want to see the draft in the real site layout *before* publishing? The build
only reads `STORYBLOK_PUBLIC_TOKEN`, and `~/.env` wires that to the
published-only prod token — so point it at the preview token explicitly:

```
op run --env-file="$HOME/.env" --no-masking -- sh -c \
  'STORYBLOK_PUBLIC_TOKEN=$STORYBLOK_PREVIEW_TOKEN STORYBLOK_VERSION=draft npm run build'
```

And if
the deploy log shows a DeepL-quota `::warning`, the build still succeeded —
remaining strings were translated by Claude directly instead of DeepL.

## Step 4 — Review translations (local, no PRs)

```
op run --env-file="$HOME/.env" --no-masking -- node scripts/review-translations.mjs
#   --all              review all five locales (default: just the gated DE/ES)
#   --domain blog      only blog posts (default loads pages + blog + UI strings)
#   --post <slug>      only one article (filters the blog domain only)
#   --locale es        one language;  --port <n>  overrides 4477
```

This starts a local web app (default `http://localhost:4477`). It is the unified
copy-review tool: a default run loads **marketing pages, blog posts, and the
Lingui UI strings**, English side-by-side with the translation, every string
editable. Click **Save & approve** — blog reviews land in
`content/translations/<uuid>.<locale>.json`, page reviews in
`content/pages/<slug>.<locale>.json` (+ approval manifests), and UI-string
reviews go **straight into `src/i18n/catalogs/<locale>.po`**.

Then commit and push (signed) — note the three paths; `content/` alone misses
UI-string edits, and the app also updates the *tracked* translation cache when
it machine-translates a missing pair:

```
git add content/ src/i18n/catalogs/ scripts/.i18n-cache.json && git commit -S -m "i18n: review <post> DE/ES" && git push
```

One warning: never delete a reviewed `content/translations/*.json` file without
also demoting its entry in `content/i18n-approvals.json`. For the gated DE/ES an
approved entry with a missing file **fails the next build** on purpose; for
reviewed FR/IT/PT there is **no failure** — the build silently reverts to
machine translation, so the demote-before-delete rule applies there with no
safety net.

The next build serves your reviewed DE/ES (and any reviewed FR/IT/PT) verbatim.
Editing the English original later auto-demotes a translation until you re-review it.

## Writing a post directly in Storyblok (no importer)

You can also create a `blog_post` story in the `blog/` folder by hand. You lose the
automated proofread / glossary / tag steps (add tags in Storyblok's Tags field
yourself), but everything else — publish, auto-translation, local review — is the same.

## Why translation review is local (not in Storyblok)

Reviewing all languages inside the Storyblok editor needs **field-level i18n**,
which requires a Storyblok plan supporting 5+ locales. This space's `starter_2025`
plan caps at **1 extra locale**, so that path is blocked without a paid upgrade.
The local review app is the no-cost equivalent. If the plan is ever upgraded, the
migration to in-Storyblok review is scoped and ready to revisit.

## The moving parts (reference)

- `scripts/new-post.mjs` — importer (md/html → Storyblok draft) + proofread + glossary + tags.
- `scripts/review-translations.mjs` — unified local copy-review app (pages + blog + UI strings).
- `scripts/lib/page-gate.mjs` + `content/pages/`, `content/page-approvals.json` — the marketing-page mirror of the blog gate.
- `scripts/.i18n-cache.json` — committed translation cache (determinism + DeepL quota); `REGEN_LOCALES=fr,it,pt` on a build drops a locale's cache to force re-translation.
- `scripts/fetch-blog.mjs` — build step: fetches published posts, auto-translates FR/IT/PT, serves reviewed translations.
- `scripts/lib/blog-gate.mjs` — the review gate + which locales are gated (DE/ES) vs auto (FR/IT/PT).
- `scripts/lib/llm-postedit.mjs` — the Claude voice pass over DeepL (informal register, profanity, foreign-quote, glossary rules).
- `scripts/i18n-glossary.json` — do-not-translate terms.
- `content/translations/` + `content/i18n-approvals.json` — reviewed translations + approval state.
- `content/tag-translations.json` — localized tag labels (Storyblok's `tag_list` is global/English; this map gives per-locale display labels, keeping loanwords in English). The importer fills it for new tags; `scripts/translate-tags.mjs` backfills every published post's tags. Editable — fix any label by hand.

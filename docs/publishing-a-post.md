# Publishing a blog post

The one-page guide to going from a draft to a live, translated post — and what's
automated vs. what you do by hand.

## TL;DR

```
1. Write the article (Markdown or HTML).
2. Import it:   op run --env-file="$HOME/.env" --no-masking -- node scripts/new-post.mjs my-post.md
3. Review it in Storyblok, then click Publish.        → EN + FR/IT/PT go live (FR/IT/PT machine-translated)
4. Review DE/ES (and optionally FR/IT/PT) locally:   op run --env-file="$HOME/.env" --no-masking -- node scripts/review-translations.mjs
   → edit in the browser, Save, then:  git add content/ && git commit -S && git push   → reviewed versions go live
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
- `DEEPL_API_KEY` and `STORYBLOK_MANAGEMENT_TOKEN` are in your local `~/.env`.
- `ANTHROPIC_API_KEY` is currently **CI-only**. The proofread, tag suggestion, and
  the review app's *fresh* machine translation use it — without it those steps
  degrade (proofread/tags skip; translations are raw DeepL you then edit). To turn
  them on locally, add `ANTHROPIC_API_KEY` to `~/.env` via the 1Password/Ansible
  flow (don't hand-edit `~/.env`).

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
original_url:                 # ONLY if republished elsewhere first; empty = canonical to your site
tags:                         # comma-separated; empty = auto-suggested
---
```

- A leading `# H1` is dropped from the body (the `title` field owns the headline).
- **`original_url`**: leave it **empty** for posts original to your site (they
  self-canonical). Only set it if the post was published somewhere else first —
  then the canonical points there. Getting this wrong hands your SEO to another site.
- Without `ANTHROPIC_API_KEY`, generation is skipped and the importer prompts for
  the missing fields instead.

## Step 2 — Import

```
op run --env-file="$HOME/.env" --no-masking -- node scripts/new-post.mjs my-post.md
```

This creates the **draft** story `blog/<slug>` in Storyblok and, along the way:

- converts the body to Richtext (headings, lists, links, blockquotes, code, images);
- **proofreads** the English source and offers to apply fixes;
- flags **glossary candidates** (acronyms/product names not in the do-not-translate list) to add;
- **suggests tags** (reusing existing ones) and attaches them;
- derives title/slug/date and generates excerpt + SEO (frontmatter overrides; prompts only if there's no key).

Flags: `--dry-run` (preview the Richtext, no API call), `--no-prompt`, `--no-proofread`.

## Step 3 — Review in Storyblok and Publish

Open the draft in Storyblok, skim it, adjust anything (including tags), then
**Publish**. Publishing fires the rebuild webhook. On that build:

- **EN** goes live.
- **FR / IT / PT** are machine-translated and go live immediately (shown with a
  machine-translation disclosure).
- **DE / ES** do **not** appear yet — they're gated on your review (Step 4).

## Step 4 — Review translations (local, no PRs)

```
op run --env-file="$HOME/.env" --no-masking -- node scripts/review-translations.mjs
#   --all         review all five locales (default: just the gated DE/ES)
#   --post <slug> only one article
```

This starts a local web app (default `http://localhost:4477`). For each post ×
language it shows the **English source beside the translation**, every string
editable. Edit what you want, click **Save & approve** — that writes the reviewed
translation to `content/translations/<uuid>.<locale>.json` and marks it approved.

Then commit and push (signed):

```
git add content/ && git commit -S -m "i18n: review <post> DE/ES" && git push
```

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
- `scripts/review-translations.mjs` — local translation review app.
- `scripts/fetch-blog.mjs` — build step: fetches published posts, auto-translates FR/IT/PT, serves reviewed translations.
- `scripts/lib/blog-gate.mjs` — the review gate + which locales are gated (DE/ES) vs auto (FR/IT/PT).
- `scripts/lib/llm-postedit.mjs` — the Claude voice pass over DeepL (informal register, profanity, foreign-quote, glossary rules).
- `scripts/i18n-glossary.json` — do-not-translate terms.
- `content/translations/` + `content/i18n-approvals.json` — reviewed translations + approval state.
- `content/tag-translations.json` — localized tag labels (Storyblok's `tag_list` is global/English; this map gives per-locale display labels, keeping loanwords in English). The importer fills it for new tags; `scripts/translate-tags.mjs` backfills every published post's tags. Editable — fix any label by hand.

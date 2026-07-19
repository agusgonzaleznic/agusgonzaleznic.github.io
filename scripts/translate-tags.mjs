// scripts/translate-tags.mjs — backfill content/tag-translations.json with a
// localized label (de/es/fr/it/pt) for EVERY tag on every published post.
//
// scripts/new-post.mjs already fills the map for tags it sets, so this is for
// posts tagged directly in Storyblok (or to backfill after adding a tag).
// Missing labels are translated by Claude (keeping loanwords) and written to the
// map; review + commit the result. Run:
//   op run --env-file="$HOME/.env" --no-masking -- node scripts/translate-tags.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPublishedPosts } from "./lib/storyblok-fetch.mjs";
import { ensureTagTranslations } from "./lib/tag-i18n.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapPath = resolve(__dirname, "../content/tag-translations.json");
const token = process.env.STORYBLOK_PUBLIC_TOKEN;
if (!token) {
  console.error("translate-tags: STORYBLOK_PUBLIC_TOKEN is required (run under `op run`).");
  process.exit(1);
}

const posts = await fetchPublishedPosts({ token });
const tags = [...new Set(posts.flatMap((p) => p.tag_list ?? []))].sort((a, b) => a.localeCompare(b));
console.log(`translate-tags: ${tags.length} tag(s) across de/es/fr/it/pt…`);
const added = await ensureTagTranslations(tags, ["de", "es", "fr", "it", "pt"], mapPath);
console.log(
  added
    ? `✓ added ${added} label(s) to content/tag-translations.json — review + commit`
    : "✓ all tags already have labels",
);

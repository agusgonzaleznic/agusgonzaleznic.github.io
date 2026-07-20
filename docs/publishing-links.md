# Managing the Links page (`/links`)

The **[/links](https://agusgonzaleznic.com/links)** page is a minimal "linktree" — a
profile header plus a stacked list of links. It is **fully managed in Storyblok**;
you never need to touch code to add, remove, reorder, or re-label a link.

- **URL:** `/links` (and `/de/links`, `/es/links`, `/fr/links`, `/it/links`, `/pt/links`).
- **Storyblok story:** `pages/links` (a `page` with one **Links Block**).
- **Not in the site nav** — it's a standalone, shareable page.
- Link labels and the tagline are **auto-translated** into all five languages; URLs
  and logos are left untouched.

---

## Editing links

Open the **`pages/links`** story in Storyblok → the **Links Block** holds:

- **Heading** — the name shown under the photo (leave blank to default to your name).
- **Tagline** — the line under the heading.
- **Links** — an ordered list of **Link** blocks. Drag to reorder; delete to remove.

Each **Link** block has:

| Field | What it does |
|-------|--------------|
| **Label** | The button text (e.g. `LinkedIn`, `Buy Me a Coffee`). |
| **URL** | `https://…` (opens in a new tab), `mailto:…`, or an internal path like `/blog` (stays in-site, locale-aware). |
| **Description** | Optional subtitle under the label. |
| **Icon** | Pick from the built-in set (see below). Ignored if a Custom logo is set. |
| **Identity link** | Turn **on** only for "this is me elsewhere" profiles (LinkedIn, GitHub, Medium, …). It adds the URL to the page's `sameAs` structured data and a `rel="me"` link — good for SEO/GEO. Leave **off** for email, booking, your blog, etc. |
| **Custom logo** | Optional uploaded logo. **Overrides the Icon.** See below. |

### Built-in icons
`LinkedIn, GitHub, Email, Calendar / Booking, Blog / Book, Writing (Medium),
Website, YouTube, Twitter, X, RSS, Coffee / Buy Me a Coffee, Generic link`.

If one of these fits, just pick it — no upload needed.

---

## Adding a link that needs its own logo (e.g. Buy Me a Coffee)

Worked example: `https://buymeacoffee.com/agusgonzaleznic`.

1. **Get a logo.** For the best look, use a **single-colour SVG**:
   - Go to **[simpleicons.org](https://simpleicons.org)**, search the brand
     (e.g. "Buy Me a Coffee"), and **download the SVG**. Simple Icons are
     monochrome silhouettes, which is exactly what this page wants.
   - A transparent **PNG** works too. Avoid JPEGs (no transparency).
   - *(Shortcut: "Buy Me a Coffee" also has a built-in **Coffee** icon option — pick
     that from the Icon dropdown and skip the upload entirely.)*
2. **Upload it to Storyblok.** In the Link block, open **Custom logo** → *Add asset*
   → upload the SVG/PNG (or pick it from the Asset Library).
3. **Fill the rest:** Label `Buy Me a Coffee`, URL `https://buymeacoffee.com/agusgonzaleznic`.
   Leave the Icon dropdown alone — the Custom logo takes precedence.
4. **Publish** and refresh (below).

### Why monochrome?
Uploaded logos are painted as a **single-colour silhouette** so they match the
other icons regardless of the file's own colours. That's why an SVG or a
**transparent** PNG is required — an opaque image (like a JPEG) would render as a
solid block. If you ever want a logo in its brand colour instead, ask and we can
add a per-link "keep original colour" toggle.

---

## Previewing and publishing

**While editing (no publish needed):** open the story with the **Dev** environment
selected and preview at `https://localhost:8080/preview/pages/links` — it renders
your draft live as you type. Start the dev server first:

```
op run --env-file="$HOME/.env" --no-masking -- env VITE_HTTPS=true npm run dev
```

**To go live:** click **Publish** in Storyblok. The publish fires a webhook that
rebuilds and deploys the site (a few minutes + CDN refresh). All five locale
variants are regenerated automatically.

**Seeing it on the local build:** the local site bakes a *snapshot* at fetch time,
so after publishing you must re-snapshot — restart `npm run dev`, or run
`op run --env-file="$HOME/.env" --no-masking -- npm run fetch-pages`. A running dev
server does **not** pick up Storyblok edits on its own, and the build reads
**published** content (give the CDN a few seconds after publishing).

---

## Notes

- **Icon set is code-bounded.** Adding a *new* built-in icon option is a code change
  (`src/lib/storyblok-icons.ts` `LINK_ICON_MAP` + the `link_item` `icon` option in
  Storyblok + `terraform/storyblok.tf`). Custom-logo upload exists precisely so you
  don't need that for one-offs.
- **Schema source of truth:** the `links_block` / `link_item` components live in
  `terraform/storyblok.tf`; the page renders via `src/components/Links.tsx` +
  `src/pages/Links.tsx`.

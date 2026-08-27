# Managing the Links page (`/links`)

The **[/links](https://agusgonzaleznic.com/links)** page is a minimal "linktree": a
profile header plus a stacked list of links. It is **fully managed in Storyblok**;
you never need to touch code to add, remove, reorder, or re-label a link.

- **URL:** `/links` (and `/de/links`, `/es/links`, `/fr/links`, `/it/links`, `/pt/links`).
- **Storyblok story:** `pages/links` (a `page` with one **Links Block**).
- **Not in the site nav**: it's a standalone, shareable page.
- The heading, tagline, link labels **and descriptions** are **auto-translated**
  into all five languages (translation is denylist-based: every text field not
  explicitly excluded gets translated); URLs, icons, and logos are left untouched.

---

## Editing links

Open the **`pages/links`** story in Storyblok → the **Links Block** holds:

- **Heading**: the name shown under the photo. Don't blank it: Storyblok saves a
  cleared field as an empty string, which renders an empty `<h1>` (the code's
  name fallback only fires for a never-saved field).
- **Show This Section**: leave **on**. Toggling it off renders the entire page
  body as nothing, with no error anywhere.
- **Tagline**: the line under the heading.
- **Links**: an ordered list of **Link** blocks. Drag to reorder; delete to remove.

Each **Link** block has:

| Field | What it does |
|-------|--------------|
| **Label** | The button text (e.g. `LinkedIn`, `Ko-fi`). |
| **URL** | `https://…` (opens in a new tab), `mailto:…` / `tel:…` (same tab), or an internal path like `/blog` (stays in-site, locale-aware). |
| **Description** | Optional subtitle under the label. |
| **Featured (accent button)** | Renders the link as the filled accent button, for the single primary CTA (the live "Book an intro call" uses it). |
| **Icon** | Pick from the built-in set (see below). Ignored if a Custom logo is set. |
| **Identity link** | Turn **on** only for "this is me elsewhere" profiles (LinkedIn, GitHub, Medium, …). It adds the URL to the page's `sameAs` structured data and a `rel="me"` link, good for SEO/GEO. Leave **off** for email, booking, your blog, etc. Fine print: only `https?://` URLs feed `sameAs`, and `rel="me"` is only emitted on external new-tab links; flagging a `mailto:`/internal link does nothing. |
| **Custom logo** | Optional uploaded logo. **Overrides the Icon.** See below. |

### Built-in icons
`LinkedIn, GitHub, Instagram, Email, Calendar / Booking, Blog / Book, Writing
(Medium), Website, YouTube, Twitter, X, RSS, Coffee / Buy Me a Coffee, Generic link`.

If one of these fits, just pick it: no upload needed.

---

## Adding a link that needs its own logo (e.g. Ko-fi)

Worked example: `https://ko-fi.com/agusgonzaleznic`.

1. **Get a logo.** For the best look, use a **single-colour SVG**:
   - Go to **[simpleicons.org](https://simpleicons.org)**, search the brand
     (e.g. "Ko-fi"; its Simple Icons slug is `kofi`), and **download the SVG**. Simple Icons are
     monochrome silhouettes, which is exactly what this page wants.
   - A transparent **PNG** works too. Avoid JPEGs (no transparency).
   - *(Ko-fi has no built-in icon, so a Custom logo upload is the way to go.)*
2. **Upload it to Storyblok.** In the Link block, open **Custom logo** → *Add asset*
   → upload the SVG/PNG (or pick it from the Asset Library). **Set the asset's alt
   text**: it becomes the icon's accessible name (falls back to the Label).
3. **Fill the rest:** Label `Ko-fi`, URL `https://ko-fi.com/agusgonzaleznic`.
   Leave the Icon dropdown alone: the Custom logo takes precedence.
4. **Publish** and refresh (below).

### Why monochrome?
Uploaded logos are painted as a **single-colour silhouette** so they match the
other icons regardless of the file's own colours. That's why an SVG or a
**transparent** PNG is required: an opaque image (like a JPEG) would render as a
solid block. If you ever want a logo in its brand colour instead, ask and we can
add a per-link "keep original colour" toggle.

---

## Previewing and publishing

**While editing (no publish needed):** open the story with the **Dev** environment
selected and preview at `https://localhost:8080/preview/pages/links`; it renders
your draft live as you type. Start the dev server first:

```
op run --env-file="$HOME/.env" --no-masking -- env VITE_HTTPS=true npm run dev
```

The preview route additionally needs a **draft-capable token** in
`.env.development.local` as `VITE_STORYBLOK_ACCESS_TOKEN` (see `.env.example`);
`~/.env` alone renders "Storyblok is disabled" on `/preview/*`. That VITE_ var is
dev-only; the production build guard forbids it.

**To go live:** click **Publish** in Storyblok. The publish fires a webhook that
rebuilds and deploys the site (a few minutes + CDN refresh). All five locale
variants are regenerated automatically.

**Seeing it on the local build:** the local site bakes a *snapshot* at fetch time,
so after publishing you must re-snapshot: restart `npm run dev`, or run
`op run --env-file="$HOME/.env" --no-masking -- npm run fetch-pages`. A running dev
server does **not** pick up Storyblok edits on its own, and the build reads
**published** content (give the CDN a few seconds after publishing).

---

## Notes

- **Icon set is code-bounded.** Adding a *new* built-in icon option is a code change
  (`src/lib/storyblok-icons.ts` `LINK_ICON_MAP` + the `link_item` `icon` option in
  Storyblok + `terraform/storyblok.tf`). Custom-logo upload exists precisely so you
  don't need that for one-offs.
- **A link that doesn't show up** was probably filtered: rows missing either Label
  or URL are silently dropped, and `javascript:`/`data:` URL schemes are refused;
  no error appears in Storyblok.
- **The story also carries the page's SEO fields** (SEO Title, SEO Description,
  Social Media Image) on the `page` component: they control search/social
  appearance for `/links`; empty falls back to hardcoded copy.
- **Schema source of truth:** the `links_block` / `link_item` components live in
  `terraform/storyblok.tf`; the page renders via `src/components/Links.tsx` +
  `src/pages/Links.tsx`.

// The link preview and the icons, read from the BUILT documents in dist/.
//
// WHY. Only crawlers read these tags, so nothing on the site shows when they go
// wrong. The preview image was a 1500 x 500 WebP listed first for months, where
// LinkedIn and Facebook ask for 1.91:1 and LinkedIn and Slack previews have
// failed on WebP, and the touch icon was a photo. prerender.mjs checks every
// internal href, but og:image and twitter:image are absolute URLs in `content`
// attributes, so a renamed or deleted image would ship unnoticed.
//
// No browser and no server: these are file checks on the build output.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
const SITE = "https://agusgonzaleznic.com/";

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(join(dir, e.name)) : e.name.endsWith(".html") ? [join(dir, e.name)] : [],
  );
}

// Every <meta> as an attribute map, whatever the attribute order.
function metas(html) {
  return [...html.matchAll(/<meta\s[^>]*>/g)].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([a-z:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]])),
  );
}

function format(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.toString("latin1", 1, 4) === "PNG") return "png";
  if (buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  return "unknown";
}

// Width and height from the first start-of-frame marker.
function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length; ) {
    assert.equal(buf[i], 0xff, `JPEG marker expected at byte ${i}`);
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("no start-of-frame marker");
}

test("every page's preview image is a JPEG or PNG that ships, and the shared card is 1200 x 630", () => {
  const docs = htmlFiles(dist);
  const local = new Map();
  for (const file of docs) {
    const tags = metas(readFileSync(file, "utf-8"));
    const images = tags.filter((t) => t.property === "og:image" || t.name === "twitter:image").map((t) => t.content);
    // The 404 page is noindex and has nothing to preview; every other page does.
    if (!file.endsWith(`${dist}/404.html`)) assert.ok(images.length, `${file} has no preview image`);
    for (const url of images) {
      assert.ok(url.startsWith("https://"), `${file}: preview image is not an absolute https URL: ${url}`);
      if (url.startsWith(SITE)) local.set(url.slice(SITE.length), file);
    }
    const width = tags.find((t) => t.property === "og:image:width")?.content;
    const height = tags.find((t) => t.property === "og:image:height")?.content;
    if (width || height) assert.deepEqual([width, height], ["1200", "630"], `${file}: og:image size`);
  }
  // An empty or wrong dist/ would pass everything above: 11 pages in 6 languages
  // without the CMS (CI's build), more with it.
  assert.ok(docs.length >= 60, `read only ${docs.length} documents`);
  assert.ok(local.has("og-card.jpg"), "no page names /og-card.jpg");
  for (const [path, file] of local) {
    const at = join(dist, path);
    assert.ok(existsSync(at), `${file} names /${path}, which is not in dist/`);
    const buf = readFileSync(at);
    assert.ok(["jpeg", "png"].includes(format(buf)), `/${path} is ${format(buf)}, not a JPEG or PNG`);
  }
  assert.deepEqual(jpegSize(readFileSync(join(dist, "og-card.jpg"))), { width: 1200, height: 630 });
});

test("the icons: a 16/32/48 px ICO, an SVG, and an opaque 180 px touch icon", () => {
  const html = readFileSync(join(dist, "index.html"), "utf-8");
  const links = [...html.matchAll(/<link\s[^>]*rel="(icon|apple-touch-icon)"[^>]*>/g)].map(([tag]) => tag.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(links.sort(), ["/apple-touch-icon.png", "/favicon.ico", "/favicon.svg"]);

  const ico = readFileSync(join(dist, "favicon.ico"));
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + 16 * i]);
  assert.deepEqual(sizes, [16, 32, 48]);

  assert.match(readFileSync(join(dist, "favicon.svg"), "utf-8"), /^<svg [^>]*viewBox="0 0 (\d+) \1"/);

  const touch = readFileSync(join(dist, "apple-touch-icon.png"));
  assert.equal(format(touch), "png");
  assert.deepEqual([touch.readUInt32BE(16), touch.readUInt32BE(20)], [180, 180]);
  // Colour type 2 is RGB without alpha: iOS fills transparent pixels with black.
  assert.equal(touch[25], 2, "the touch icon has an alpha channel");
});

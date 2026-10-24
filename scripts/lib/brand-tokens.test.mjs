// Tests for the brand colour contract. Every check in assert-brand-tokens.mjs
// exists to FAIL on drift, so each finder is shown catching a real case from
// the 2026-10-24 drift list, and each is shown ignoring what is not a colour.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankTsComments,
  colourLiterals,
  contrast,
  floorResults,
  hexToRgb,
  hslToRgb8,
  icoImages,
  palette,
  parseTriplet,
  shellTokens,
  stockPaletteUses,
  stylesheetTokens,
  toHex,
} from "./brand-tokens.mjs";

test("HSL converts to the 8-bit colour the browser paints", () => {
  // Both pinned by tests/e2e/design-tokens.test.mjs from Chromium's computed style.
  assert.deepEqual(hslToRgb8([10, 85, 47]), [222, 52, 18]);
  assert.deepEqual(hslToRgb8([220, 10, 59]), [140, 147, 161]);
  assert.equal(toHex(hslToRgb8([0, 0, 98])), "#FAFAFA");
  assert.equal(toHex(hslToRgb8([220, 15, 12])), "#1A1D23");
});

test("contrast matches WCAG's reference points and is not rounded", () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21);
  assert.equal(contrast([255, 255, 255], [255, 255, 255]), 1);
  // #777 on white is the textbook near miss: about 4.48, so it fails 4.5.
  const grey = contrast(hexToRgb("#777"), [255, 255, 255]);
  assert.ok(grey > 4.47 && grey < 4.5, String(grey));
  // The retired 58% coral, the reason the accent was darkened on 2026-08-20.
  assert.ok(contrast([255, 255, 255], hslToRgb8([10, 85, 58])) < 3.5);
});

test("parseTriplet accepts only bare HSL triplets", () => {
  assert.deepEqual(parseTriplet("10 85% 47%"), [10, 85, 47]);
  assert.equal(parseTriplet("0.75rem"), null);
  assert.equal(parseTriplet("linear-gradient(135deg, hsl(10 85% 47%), red)"), null);
});

const CSS = `
/* --decoy: 1 2% 3%; a comment must never define a token */
@custom-variant dark (&:is(.dark *));
@utility container { --not-a-token: 1 2% 3%; }
@layer base {
  :root {
    --background: 0 0% 98%;
    --accent: 10 85% 47%; /* matches --ring */
    --radius: 0.75rem;
  }
  .dark {
    --background: 220 18% 8%;
  }
}
.x { box-shadow: 0 8px 32px -8px hsl(10 85% 58% / 0.3); color: hsl(var(--accent)); }
.y { background-image: url("data:image/svg+xml,%3Cpath stroke='%23DE3412'/%3E"); }
#root, a#cta { min-height: 100vh; }
`;

test("stylesheet tokens come from :root and .dark, never from comments", () => {
  const t = stylesheetTokens(CSS);
  assert.deepEqual(t.root, { background: [0, 0, 98], accent: [10, 85, 47] });
  // Not the @custom-variant line or the @utility block that precede it.
  assert.deepEqual(t.dark, { background: [220, 18, 8] });
  const p = palette(t);
  assert.deepEqual(p.get("#DE3412"), ["accent"]);
  assert.deepEqual(p.get("#FAFAFA"), ["background"]);
  assert.equal(p.size, 2, "the dormant .dark colours are not brand colours");
});

test("the pre-paint shell's hand-mirrored tokens are read from index.html", () => {
  const html = `<!-- @layer base{:root{--accent:1 2% 3%}} -->
    <style>@layer properties, theme, base;
    @layer base{:root{--background:0 0% 98%;--accent:10 85% 58%}*{border-color:hsl(var(--border))}}</style>`;
  assert.deepEqual(shellTokens(html), { background: "0 0% 98%", accent: "10 85% 58%" });
});

test("colour literals: the drift cases are found, token references and selectors are not", () => {
  const css = colourLiterals(CSS, "css").map((f) => f.text);
  assert.deepEqual(css, ["%23DE3412", "hsl(10 85% 58% / 0.3)"]);

  const html = colourLiterals('<meta name="theme-color" content="#FF6B4A" /><!-- #000000 --><a href="#faq">&#160;</a>', "html");
  assert.deepEqual(html.map((f) => [f.text, toHex(f.rgb)]), [["#FF6B4A", "#FF6B4A"]]);

  const ts = colourLiterals(
    [
      'const a = "#C62E10"; // was #E63B11',
      "/* #EF5739 */ <a href=\"#contact\" />",
      'const u = "https://example.com/#deadbe";',
      "style={{ color: 'rgb(1, 2, 3)' }}",
    ].join("\n"),
    "ts",
  );
  assert.deepEqual(ts.map((f) => f.text), ["#C62E10", "#deadbe", "rgb(1, 2, 3)"]);
});

test("TS comment blanking keeps the // of a URL", () => {
  const out = blankTsComments('x = "https://a.b/c"; // gone\n// gone too');
  assert.match(out, /https:\/\/a\.b\/c/);
  assert.doesNotMatch(out, /gone/);
});

test("stock Tailwind palette uses are found, token classes are not", () => {
  const text = `bg-black/80 hover:text-white group-[.destructive]:text-red-300 ring-offset-red-600
    border-color: var(--color-gray-200, currentcolor);
    bg-accent/10 text-muted-foreground bg-background context-white`;
  assert.deepEqual(
    stockPaletteUses(text).map((f) => f.text),
    ["bg-black/80", "text-white", "text-red-300", "ring-offset-red-600", "--color-gray-200"],
  );
});

/** A minimal .ico with one 2x1 32-bit BMP image: one coral pixel, one transparent. */
function tinyIco([r, g, b, a] = [230, 59, 17, 255]) {
  const bmp = Buffer.alloc(40 + 8 + 4);
  bmp.writeUInt32LE(40, 0);
  bmp.writeInt32LE(2, 4);
  bmp.writeInt32LE(2, 8);
  bmp.writeUInt16LE(1, 12);
  bmp.writeUInt16LE(32, 14);
  Buffer.from([b, g, r, a, 0, 0, 0, 0]).copy(bmp, 40);
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  head.writeUInt8(2, 6);
  head.writeUInt8(1, 7);
  head.writeUInt32LE(bmp.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, bmp]);
}

test("favicon pixels are read from 32-bit BMP .ico images", () => {
  const [img] = icoImages(tinyIco());
  assert.equal(img.size, "2x1");
  assert.deepEqual(img.pixels, [
    [230, 59, 17, 255],
    [0, 0, 0, 0],
  ]);
});

test("an .ico in a format the check cannot read fails loudly", () => {
  const ico = tinyIco();
  ico.writeUInt32LE(0x474e5089, 22); // a PNG signature where the BMP header was
  assert.throws(() => icoImages(ico), /not a BMP/);
  assert.throws(() => icoImages(Buffer.from("not an icon at all")), /not an \.ico/);
});

const ROOT = {
  background: [0, 0, 98],
  foreground: [220, 15, 12],
  card: [0, 0, 100],
  primary: [220, 15, 12],
  "primary-foreground": [0, 0, 98],
  secondary: [220, 10, 92],
  "secondary-foreground": [220, 15, 12],
  muted: [220, 10, 92],
  "muted-foreground": [220, 12, 38],
  accent: [10, 85, 47],
  "accent-foreground": [0, 0, 100],
  "accent-hover": [10, 85, 42],
  "accent-end": [20, 80, 43],
  destructive: [0, 72, 51],
  "destructive-foreground": [0, 0, 98],
  input: [220, 10, 58],
  ring: [10, 85, 47],
};

test("contrast floors pass on the shipped palette", () => {
  const failed = floorResults(ROOT).filter((r) => !r.ok);
  assert.deepEqual(failed, []);
});

test("contrast floors fail when a token drifts or goes missing", () => {
  // The two real cases: the input edge at 59% is 2.96:1 on the page, and the
  // retired 58% coral put white CTA text at 3.44:1.
  const drifted = { ...ROOT, input: [220, 10, 59], accent: [10, 85, 58] };
  const failed = floorResults(drifted).filter((r) => !r.ok).map((r) => `${r.fg}/${r.bg}`);
  assert.deepEqual(failed, ["accent-foreground/accent", "input/background"]);
  const noRing = { ...ROOT };
  delete noRing.ring;
  assert.ok(floorResults(noRing).some((r) => r.missing && r.fg === "ring"));
});

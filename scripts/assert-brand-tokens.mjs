// The brand colour contract, enforced. src/index.css owns every colour; this
// fails when anything else disagrees with it (rules in scripts/lib/brand-tokens.mjs):
//
//   1. index.html's pre-paint shell mirrors tokens by hand: each must equal
//      the stylesheet's.
//   2. Every colour written outside a token definition (the theme-color meta,
//      the squiggle's data URI, shadows, gradient stops, SVGs in public/, any
//      hex or hsl() in a component) must be a token's colour.
//   3. Every visible pixel of public/favicon.ico must be a token's colour.
//   4. No Tailwind stock palette (bg-black, text-red-300, --color-gray-200),
//      and no shadow size the theme does not define (Tailwind's own shadow-xl
//      is black, not charcoal): those colours belong to no token.
//   5. The contrast floors of the brand kit hold on the colours the browser
//      paints.
//   6. No coral text below large size: `text-accent` (#DE3412, 4.37:1 on the
//      page) paints only large text and icons; smaller coral text is
//      `text-accent-hover` (#C62E10, 5.30:1).
//
// To change a colour, change its token in src/index.css, then whatever this
// names. To add one, add a token first.
//
//   node scripts/assert-brand-tokens.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  colourLiterals,
  floorResults,
  hexToRgb,
  hslToRgb8,
  icoImages,
  palette,
  parseTriplet,
  shellTokens,
  smallCoralTextUses,
  stockPaletteUses,
  stockShadowUses,
  stylesheetTokens,
  themeShadows,
  toHex,
} from "./lib/brand-tokens.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(resolve(root, f), "utf8");
const tracked = execFileSync("git", ["ls-files", "--", "src", "public", "index.html"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const css = read("src/index.css");
const tokens = stylesheetTokens(css);
const shadows = themeShadows(css);
const pal = palette(tokens);
const failures = [];
const fail = (msg) => failures.push(msg);

/** The token whose colour is closest to rgb, as a hint in a failure. */
function nearest(rgb) {
  let best = null;
  for (const [hex, names] of pal) {
    const c = hslToRgb8(tokens.root[names[0]] ?? tokens.dark[names[0]]);
    const d = Math.hypot(c[0] - rgb[0], c[1] - rgb[1], c[2] - rgb[2]);
    if (!best || d < best.d) best = { d, hex, names };
  }
  return `nearest token: --${best.names[0]} ${best.hex}`;
}

if (Object.keys(tokens.root).length < 10) fail(`src/index.css: found only ${Object.keys(tokens.root).length} colour tokens in :root; the parser no longer reads the stylesheet`);

// 1. The pre-paint shell.
const shell = shellTokens(read("index.html"));
if (Object.keys(shell).length === 0) fail("index.html: no pre-paint shell tokens found (expected `@layer base{:root{...}}`)");
for (const [name, value] of Object.entries(shell)) {
  const mine = parseTriplet(value);
  const theirs = tokens.root[name];
  if (!theirs) fail(`index.html pre-paint shell: --${name} has no colour token of that name in src/index.css`);
  else if (!mine || mine.join() !== theirs.join())
    fail(`index.html pre-paint shell: --${name} is "${value}", src/index.css says "${theirs[0]} ${theirs[1]}% ${theirs[2]}%"`);
}

// 2. Colour literals, 4. stock palette.
const kindOf = { ".css": "css", ".html": "html", ".svg": "svg", ".ts": "ts", ".tsx": "ts" };
let scanned = 0;
let literals = 0;
let coralFiles = 0;
for (const file of tracked) {
  const kind = kindOf[extname(file)];
  if (!kind) continue;
  scanned++;
  const text = read(file);
  for (const f of colourLiterals(text, kind)) {
    literals++;
    const hex = toHex(f.rgb);
    if (!pal.has(hex)) fail(`${file}:${f.line}: ${f.text} is ${hex}, which is no token's colour (${nearest(f.rgb)})`);
  }
  if (kind === "ts" || kind === "css") {
    for (const f of stockPaletteUses(text)) fail(`${file}:${f.line}: ${f.text} is Tailwind's stock palette, not a token`);
    if (kind === "ts") {
      for (const f of stockShadowUses(text, shadows))
        fail(`${file}:${f.line}: ${f.text} is not in src/index.css's @theme, so it is Tailwind's stock black shadow`);
      // 6. Small coral text.
      if (/text-accent(?![\w-])/.test(text)) coralFiles++;
      for (const f of smallCoralTextUses(text))
        fail(`${file}:${f.line}: ${f.text} paints coral text below large size ("${f.classes}"); use text-accent-hover, or mark an icon with a \`brand: coral-ok\` comment`);
    }
  }
}
if (scanned < 20) fail(`scanned only ${scanned} files under src/, public/ and index.html; the file list is wrong`);
if (coralFiles < 5) fail(`found text-accent in only ${coralFiles} files; the coral text check no longer reads the components`);

// 3. The favicon.
const images = icoImages(readFileSync(resolve(root, "public/favicon.ico")));
for (const { size, pixels } of images) {
  const off = new Map();
  for (const [r, g, b, a] of pixels) {
    if (a === 0) continue;
    const hex = toHex([r, g, b]);
    if (!pal.has(hex)) off.set(hex, (off.get(hex) ?? 0) + 1);
  }
  if (off.size) {
    const worst = [...off].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([h, n]) => `${h} x${n}`).join(", ");
    fail(`public/favicon.ico ${size}: ${[...off.values()].reduce((a, b) => a + b, 0)} visible pixels are no token's colour (${worst}; ${nearest(hexToRgb([...off.keys()][0]))})`);
  }
}

// 5. Contrast floors.
const floors = floorResults(tokens.root);
for (const r of floors.filter((x) => !x.ok)) {
  fail(
    r.missing
      ? `contrast: --${r.fg} or --${r.bg} is missing from src/index.css (${r.what})`
      : `contrast: --${r.fg} on --${r.bg} is ${r.ratio.toFixed(3)}:1, below the ${r.floor}:1 floor for ${r.what}`,
  );
}

if (failures.length) {
  console.error(`\n✖ assert-brand-tokens: ${failures.length} problem(s). src/index.css is the source of every colour:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error("");
  process.exit(1);
}
const lowest = floors.reduce((a, b) => (b.ratio - b.floor < a.ratio - a.floor ? b : a));
console.log(
  `✓ assert-brand-tokens: ${pal.size} token colours; ${Object.keys(shell).length} shell tokens match; ` +
    `${literals} colour literal(s) in ${scanned} files, all tokens; coral text in ${coralFiles} files, large or icons only; ` +
    `favicon ${images.map((i) => i.size).join("/")} on palette; ` +
    `${floors.length} contrast floors hold (tightest: --${lowest.fg} on --${lowest.bg}, ${lowest.ratio.toFixed(2)}:1 vs ${lowest.floor}:1).`,
);

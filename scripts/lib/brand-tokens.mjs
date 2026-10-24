// The brand colour contract, as code: src/index.css owns every colour, and
// anything outside its token blocks must match a token or fail the build.
//
// WHY. Before this existed, colours drifted wherever one was written by hand
// instead of read from the tokens: the favicon's coral (#E63B11) and the one in
// <meta name="theme-color"> were never token values at all, the accent glow
// kept the retired 58% coral, and the stylesheet's contrast comments
// were measured against white while the page is #FAFAFA. Nothing failed,
// because nothing compared them. scripts/assert-brand-tokens.mjs runs these
// checks in CI; this module is the pure part, tested in brand-tokens.test.mjs.

/** "10 85% 47%" -> [10, 85, 47], or null when the value is not a bare HSL triplet. */
export function parseTriplet(value) {
  const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(value.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** CSS Color 4 hsl() to 8-bit sRGB, rounded the way the browser paints it. */
export function hslToRgb8([h, s, l]) {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((c) => Math.round(c * 255));
}

export const toHex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** "#de3412", "#DE3412", "#fff" -> [r, g, b] */
export function hexToRgb(hex) {
  let h = hex.replace(/^(#|%23)/, "");
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** WCAG 2.2 relative luminance of an 8-bit sRGB colour. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio, unrounded: 4.499 fails a 4.5 floor. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Replace comments with spaces, so offsets and line numbers stay true. */
export function blankComments(text, open = "/*", close = "*/") {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(open, i);
    if (start === -1) return out + text.slice(i);
    const end = text.indexOf(close, start + open.length);
    const stop = end === -1 ? text.length : end + close.length;
    out += text.slice(i, start) + text.slice(start, stop).replace(/[^\n]/g, " ");
    i = stop;
  }
  return out;
}

/** TS/TSX comments blanked: block comments, and `//` comments that are not the `//` of a URL. */
export function blankTsComments(text) {
  return blankComments(text).replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, lead) => lead + " ".repeat(m.length - lead.length));
}

/**
 * The body of the first `{ ... }` block opened by `marker`, braces balanced. A
 * RegExp marker must match up to and including that opening brace.
 */
export function blockAfter(text, marker) {
  let open;
  if (marker instanceof RegExp) {
    const m = marker.exec(text);
    if (!m) return null;
    open = m.index + m[0].length - 1;
  } else {
    const at = text.indexOf(marker);
    if (at === -1) return null;
    open = text.indexOf("{", at);
  }
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

/** Custom property declarations in a block: { name: value }. */
export function declarations(block) {
  const out = {};
  for (const m of (block ?? "").matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]+)/g)) out[m[1]] = m[2].trim();
  return out;
}

/** The colour tokens of src/index.css: { name: [h, s, l] } for :root and .dark. */
export function stylesheetTokens(css) {
  const clean = blankComments(css);
  const pick = (block) =>
    Object.fromEntries(
      Object.entries(declarations(block))
        .map(([k, v]) => [k, parseTriplet(v)])
        .filter(([, v]) => v),
    );
  // Anchored on the rule itself: `.dark` also appears earlier, inside
  // `@custom-variant dark (&:is(.dark *))`.
  return { root: pick(blockAfter(clean, /(?:^|[\s}]):root\s*\{/)), dark: pick(blockAfter(clean, /(?:^|[\s}])\.dark\s*\{/)) };
}

/** The tokens index.html's pre-paint shell mirrors by hand: { name: "h s% l%" }. */
export function shellTokens(html) {
  return declarations(blockAfter(blankComments(html, "<!--", "-->"), "@layer base{:root"));
}

/**
 * Every light-mode token colour as 8-bit hex, mapped to the token names that
 * produce it. The .dark block is left out: nothing ever sets .dark, so its
 * colours are not brand colours anywhere outside it.
 */
export function palette(tokens) {
  const out = new Map();
  for (const [name, hsl] of Object.entries(tokens.root)) {
    const hex = toHex(hslToRgb8(hsl));
    out.set(hex, [...(out.get(hex) ?? []), name]);
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/**
 * Colour literals in a file, comments excluded: hex (#RGB to #RRGGBBAA, and the
 * %23RRGGBB form inside data: URIs) and hsl()/rgb() written with numbers.
 * hsl(var(--x)) is a token reference, not a literal. In TS/TSX only six- and
 * eight-digit hex count, so in-page anchors like "#faq" never match.
 */
export function colourLiterals(text, kind) {
  const clean =
    kind === "html"
      ? blankComments(blankComments(text, "<!--", "-->"))
      : kind === "css" || kind === "svg"
        ? blankComments(blankComments(text, "<!--", "-->"))
        : blankTsComments(text);
  const hex = kind === "ts" ? /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g : /(?:#|%23)([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
  const found = [];
  for (const m of clean.matchAll(hex)) {
    // Not colours: `a#cta` (a selector) and `&#160;` (an HTML entity). A hex
    // colour never follows a word character, a hyphen or an ampersand.
    if (/[\w&-]/.test(clean[m.index - 1] ?? "")) continue;
    found.push({ line: lineOf(clean, m.index), text: m[0], rgb: hexToRgb(m[1]) });
  }
  for (const m of clean.matchAll(/\b(hsla?|rgba?)\(\s*(-?\d[^)]*)\)/g)) {
    const nums = m[2].split(/[\s,/]+/).filter(Boolean).map((n) => parseFloat(n));
    const rgb = m[1].startsWith("hsl") ? hslToRgb8(nums.slice(0, 3)) : nums.slice(0, 3).map(Math.round);
    found.push({ line: lineOf(clean, m.index), text: m[0], rgb });
  }
  return found;
}

const TW_PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

/** Tailwind's stock palette in class names or theme variables: colours no token defines. */
export function stockPaletteUses(text) {
  const re = new RegExp(
    `\\b(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|shadow|outline|decoration|divide|placeholder|caret|accent)-(?:(?:${TW_PALETTE})-\\d{2,3}|black|white)(?:/\\d+)?\\b|--color-(?:${TW_PALETTE})-\\d{2,3}\\b`,
    "g",
  );
  return [...text.matchAll(re)].map((m) => ({ line: lineOf(text, m.index), text: m[0] }));
}

/** The `--shadow-*`, `--drop-shadow-*`, ... sizes src/index.css's @theme defines, e.g. "shadow-lg". */
export function themeShadows(css) {
  const theme = declarations(blockAfter(blankComments(css), /@theme\s*\{/));
  return new Set(Object.keys(theme).filter((k) => /^(inset-|drop-|text-)?shadow-/.test(k)));
}

/**
 * Shadow utilities whose size the site's theme does not define. Tailwind's own
 * value is stock black, not the charcoal every site shadow uses.
 */
export function stockShadowUses(text, defined) {
  const re = /\b((?:inset-|drop-|text-)?shadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner))\b/g;
  return [...text.matchAll(re)]
    .filter((m) => !defined.has(m[1]))
    .map((m) => ({ line: lineOf(text, m.index), text: m[1] }));
}

/**
 * Coral text below large size. #DE3412 is 4.37:1 on the page, under the 4.5:1
 * that text below 24px (18.7px bold) needs, so `text-accent`, in any variant
 * (hover:, group-hover:) and at any alpha, may paint only large text and icons;
 * smaller coral text is `text-accent-hover` (#C62E10, 5.30:1). A use passes when
 * its class string also sets a large size without a breakpoint (text-2xl and up,
 * text-fluid-2xl and up, or text-xl / text-fluid-xl with font-bold), or sizes an
 * icon (w-N with h-N, or size-N), or when its line or the line above carries a
 * `brand: coral-ok` comment saying why. Returns [{ line, text, classes }].
 */
export function smallCoralTextUses(text) {
  const raw = text.split("\n");
  const clean = blankTsComments(text);
  const found = [];
  for (const m of clean.matchAll(/(?<![\w:-])((?:[\w-]+:)*text-accent(?:\/\d+)?)(?![\w/-])/g)) {
    // The class string around the use: class lists never hold quotes, braces or newlines.
    const from = Math.max(...['"', "'", "`", "{", "}", "\n"].map((c) => clean.lastIndexOf(c, m.index))) + 1;
    const ends = ['"', "'", "`", "{", "}", "$", "\n"].map((c) => clean.indexOf(c, m.index)).filter((i) => i !== -1);
    const classes = clean.slice(from, ends.length ? Math.min(...ends) : clean.length).trim();
    const has = (re) => re.test(` ${classes} `);
    const large =
      has(/\stext-(?:fluid-)?[2-9]xl\s/) || (has(/\stext-(?:fluid-)?xl\s/) && has(/\sfont-bold\s/));
    const icon = has(/\ssize-\d/) || (has(/\sw-\d/) && has(/\sh-\d/));
    const line = lineOf(clean, m.index);
    const marked = /brand: coral-ok/.test(`${raw[line - 2] ?? ""}\n${raw[line - 1]}`);
    if (!large && !icon && !marked) found.push({ line, text: m[1], classes });
  }
  return found;
}

/**
 * Pixels of a .ico whose images are 32-bit BMPs (the only kind this site ships).
 * Returns [{ size, pixels: [[r, g, b, a], ...] }]. Anything else throws, so a
 * new favicon in another format fails loudly instead of passing unchecked.
 */
export function icoImages(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error("not an .ico file");
  const images = [];
  for (let i = 0; i < buf.readUInt16LE(4); i++) {
    const entry = 6 + 16 * i;
    const off = buf.readUInt32LE(entry + 12);
    if (buf.readUInt32LE(off) !== 40) throw new Error(`.ico image ${i} is not a BMP (PNG entries are not supported here)`);
    const w = buf.readInt32LE(off + 4);
    const h = buf.readInt32LE(off + 8) / 2;
    if (buf.readUInt16LE(off + 14) !== 32) throw new Error(`.ico image ${i} is not 32 bits per pixel`);
    const pixels = [];
    for (let p = 0; p < w * h; p++) {
      const at = off + 40 + p * 4;
      pixels.push([buf[at + 2], buf[at + 1], buf[at], buf[at + 3]]);
    }
    images.push({ size: `${w}x${h}`, pixels });
  }
  return images;
}

/**
 * Contrast floors from the brand kit (WCAG 2.2): body copy 7:1, other text
 * below large size 4.5:1, large text and UI boundaries 3:1. Each pair is
 * [foreground, background, floor, what it is], where a side is a token
 * ("accent"), a token at an alpha ("primary-foreground/80", painted over the
 * background), or a tint on a ground ("accent/10 over background", the way
 * Tailwind's bg-accent/10 lands on the page).
 */
export const FLOORS = [
  ["foreground", "background", 7, "body copy on the page"],
  ["foreground", "card", 7, "body copy on a card"],
  ["muted-foreground", "background", 4.5, "secondary text on the page"],
  ["muted-foreground", "card", 4.5, "secondary text on a card"],
  ["muted-foreground", "muted", 4.5, "secondary text on a muted fill"],
  ["accent-foreground", "accent", 4.5, "CTA label on coral"],
  ["accent-foreground", "accent-hover", 4.5, "CTA label on the hover coral"],
  ["accent-hover", "background", 4.5, "coral text below large size, on the page"],
  ["accent-hover", "card", 4.5, "coral text below large size, on a card"],
  ["accent-hover", "muted", 4.5, "coral text on a muted fill (the language menu's hovered item)"],
  ["accent-hover", "accent/10 over background", 4.5, "coral text on the 10% coral tint (the period pills)"],
  ["accent", "background", 3, "coral at large size, icons and rules"],
  ["accent-end", "background", 3, "the gradient's end stop (large text only)"],
  ["ring", "background", 3, "the focus ring"],
  ["input", "background", 3, "a form field's edge against its own fill and the page"],
  ["input", "card", 3, "a form field's edge on a card"],
  ["primary-foreground", "primary", 4.5, "text on the charcoal band"],
  ["primary-foreground/80", "primary", 4.5, "secondary text on the charcoal band"],
  ["accent", "primary", 3, "a coral mark on the charcoal band, never text (the current language's underline)"],
  ["secondary-foreground", "secondary", 4.5, "text on a secondary fill"],
  ["destructive", "background", 4.5, "error text"],
  ["destructive-foreground", "destructive", 4.5, "text on an error fill"],
];

/**
 * The 8-bit colour one side of a floor paints: a token, or a token at an alpha
 * composited over `under` or over its named ground. null when a token is missing.
 */
export function paint(root, spec, under) {
  const [, name, pct, ground] = /^([a-z-]+)(?:\/(\d+))?(?: over ([a-z-]+))?$/.exec(spec) ?? [];
  if (!root[name] || (ground && !root[ground])) return null;
  const rgb = hslToRgb8(root[name]);
  if (!pct) return rgb;
  const base = ground ? hslToRgb8(root[ground]) : under;
  if (!base) return null;
  const a = Number(pct) / 100;
  return rgb.map((c, i) => Math.round(a * c + (1 - a) * base[i]));
}

/** Every floor, measured on the 8-bit colours the browser paints. */
export function floorResults(root) {
  return FLOORS.map(([fg, bg, floor, what]) => {
    const back = paint(root, bg);
    const front = back && paint(root, fg, back);
    if (!front) return { fg, bg, floor, what, ratio: NaN, ok: false, missing: true };
    const ratio = contrast(front, back);
    return { fg, bg, floor, what, ratio, ok: ratio >= floor };
  });
}

#!/usr/bin/env node
/**
 * A page capture becomes the Builder's document.
 *
 * The capture is a mechanical dump of a live page: every visible element
 * with its real box, its own text, and its computed styles, taken from the
 * running browser. This turns it into `site/document.json`, the file the
 * Builder's exact-copy path loads whole (polio: `repoRun.ts` reads it out
 * of a repository, `store.ts#loadDoc` → `docTake.ts#takeDoc` lays it over
 * the board).
 *
 * Every rule here is a declaration keyed on the capture's own tags and
 * numbers, in the manner of polio's `recreate.ts`. Nothing is described to
 * a model, and nothing is invented where nothing was measured: a property
 * the document format cannot hold is written down as such in the ledger
 * this prints, rather than approximated.
 *
 *   node capture-to-document.mjs <capture.json> <out-dir> [--pictures <dir>]
 *
 * Writes <out-dir>/site/document.json and prints the ledger: for every
 * captured property, where it went.
 *
 * WHAT A CAPTURED ELEMENT BECOMES. The part is chosen by what the element
 * itself draws — its own words, its picture, or nothing — never by folding
 * its children into it, because the capture recorded every child with a
 * box of its own and a composite part (a top bar, a row of tiles) draws
 * its children where it likes. So:
 *
 *   body, and the wrapper that is the page's own box   → the page's look
 *   svg                                                 → a plain box (icon); its strokes fold into it
 *   img                                                 → the `picture` part, wearing the bytes
 *   own text, h1..h6                                    → `value-prop` (a heading)
 *   own text, button or a, painted or edged             → `cta-primary` (a button)
 *   own text, anything else                             → `prose`
 *   no own text                                         → a plain box: `custom-idea`
 *
 * A plain box carries what the format lets a part carry of its own —
 * colour roles, type, shape, a link — and nothing else. Padding, borders,
 * flex and grid settings have no field on a node, and go in the ledger.
 *
 * Reading order is kept: parts are written in the capture's own order, so
 * the board draws a container first and what it holds on top of it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";

/* ------------------------------------------------------------------ */
/* Arguments                                                            */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const capturePath = args[0];
const outDir = args[1];
const picturesDir = (() => { const i = args.indexOf("--pictures"); return i >= 0 ? args[i + 1] : null; })();
if (!capturePath || !outDir) {
  console.error("usage: node capture-to-document.mjs <capture.json> <out-dir> [--pictures <dir>]");
  process.exit(2);
}
const cap = JSON.parse(readFileSync(capturePath, "utf8"));

/* ------------------------------------------------------------------ */
/* Constants transcribed from polio, cited                              */
/* ------------------------------------------------------------------ */

/** The site's base type size: `NodeFont.size` is a multiplier on it (parts/theme.ts). */
const BASE_PX = 16;
/** `applyFont` clamps: size 0.6..2, weight 300..800 to the hundred, spacing -0.05..0.3em, leading 1..2 (parts/theme.ts). */
const CLAMP = { size: [0.6, 2], weight: [300, 800], spacing: [-0.05, 0.3], leading: [1, 2] };
/** What each part multiplies the base by when it draws its words, so the captured pixels land as captured. */
const PART_SCALE = { "value-prop": 1.6, "cta-primary": 1, prose: 1, "custom-idea": 1 };
/** Board hues for groups (store.ts#HUES). */
const HUES = [265, 200, 160, 30, 340, 90, 240, 15];
/** The lamp as a new document has it (look.ts#defaultLight). */
const DEFAULT_LIGHT = { on: false, x: 0.5, y: 0.12, height: 0.55, strength: 0.45, lift: 10, warmth: 80, wash: 0 };
/** `parseColor` (look.ts) reads `#hex`, `rgb()` / `rgba()` (alpha dropped) and `oklch()`; nothing else. */
const PARSEABLE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*[,\s]\s*[\d.]+\s*[,\s]\s*[\d.]+|oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+)/i;
/** Generic family keywords that name no face (siteRead.ts#GENERIC). */
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|math|emoji|fangsong|inherit|initial|unset|-apple-system|BlinkMacSystemFont)$/i;

/** The family the page was set in, as one of the app's own (recreate.ts#familyOf). */
function familyOf(stack) {
  const s = stack.toLowerCase();
  if (/mono|courier|consolas|menlo/.test(s)) return "monospace";
  if (/georgia|times|garamond|serif/.test(s) && !/sans-serif/.test(s)) return "serif";
  if (/impact|black|display/.test(s)) return "display";
  if (/narrow|condensed/.test(s)) return "condensed";
  if (/futura|avenir|century gothic|poppins|montserrat/.test(s)) return "geometric sans";
  if (/helvetica|inter|arial|roboto/.test(s)) return "grotesque sans";
  if (/segoe|trebuchet|tahoma/.test(s)) return "humanist sans";
  if (/comic|cursive|script/.test(s)) return "handwritten";
  return /sans/.test(s) ? "system sans" : undefined;
}

/** A colour the browser reported, as [r, g, b, a] (recreate.ts#rgba). */
function rgba(v) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i.exec(v ?? "");
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}
/** How far from grey, 0..1: what makes an accent an accent (recreate.ts#chroma). */
function chroma(v) {
  const c = rgba(v);
  if (!c) return 0;
  return (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])) / 255;
}
/** Relative lightness of an rgb() colour, 0..1 (recreate.ts#light). */
function light(v) {
  const c = rgba(v);
  if (!c) return 0;
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

/** The alpha of any colour string the browser writes, 1 when it has none: `oklab(… / 0.1)`, `rgba(…, 0.5)`. */
function alphaOf(v) {
  const s = (v ?? "").trim();
  const inner = /^\w+\((.*)\)$/.exec(s)?.[1];
  if (inner === undefined) return 1;
  const pct = (x) => (x.endsWith("%") ? Number(x.slice(0, -1)) / 100 : Number(x));
  // rgb()/rgba(): a fourth number is the alpha. Everything else: only what follows a slash.
  if (/^rgba?\(/i.test(s)) {
    const nums = inner.split(/[\s,/]+/).filter(Boolean);
    return nums.length >= 4 ? pct(nums[3]) : 1;
  }
  const slash = inner.indexOf("/");
  return slash >= 0 ? pct(inner.slice(slash + 1).trim()) : 1;
}

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, [lo, hi]) => Math.max(lo, Math.min(hi, n));
const cut = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const esc = (s) => s;

/* ------------------------------------------------------------------ */
/* The ledger: where every captured property went                       */
/* ------------------------------------------------------------------ */

/**
 * One line per property per element. `to` is one of:
 *   field      — a typed field on the node or the document, and the part draws it
 *   stored     — a typed field on the node, but the part it landed on does not draw it
 *   folded     — carried into the parent it belongs to (an icon's strokes)
 *   default    — the CSS default, which says nothing and needs no home
 *   n/a        — a text property on an element that has no text
 *   nowhere    — the document format has no place for it
 */
const ledger = [];
const note = (sel, prop, to, how) => ledger.push({ sel, prop, to, how });

/* ------------------------------------------------------------------ */
/* Walking the tree                                                     */
/* ------------------------------------------------------------------ */

const page = { w: cap.page[0], h: cap.page[1] };
const url = new URL(cap.url);
const host = url.host;
const at = Date.parse(cap.capturedAt);

/** A selector the element can be found again by, as siteRead.ts#path writes one. */
function selectorOf(el) {
  if (el.t === "body") return "body";
  const bits = [];
  let node = el;
  while (node && node.t !== "body") {
    const parent = node.parent;
    const same = parent.kids.filter((c) => c.t === node.t);
    bits.unshift(same.length > 1 ? `${node.t}:nth-of-type(${same.indexOf(node) + 1})` : node.t);
    node = parent;
  }
  return `body > ${bits.join(" > ")}`;
}

const all = [];
(function walk(el, parent, depth) {
  el.parent = parent;
  el.depth = depth;
  el.kids = el.kids ?? [];
  all.push(el);
  for (const k of el.kids) walk(k, el, depth + 1);
})(cap.tree, null, 0);
for (const el of all) el.sel = selectorOf(el);

const STROKE_TAGS = new Set(["path", "polyline", "polygon", "line", "circle", "ellipse", "rect", "g", "use"]);
const isPageBox = (el) => el.x === 0 && el.y === 0 && el.w === page.w && el.h === page.h;

/** What each element becomes. Declared, in order, most particular first. */
function classify(el) {
  if (el.t === "body") return "page";
  if (el.parent?.t === "body" && isPageBox(el)) return "page";
  if (STROKE_TAGS.has(el.t) || (el.parent && el.parent.kind === "stroke")) return "stroke";
  if (el.t === "svg") return "icon";
  if (el.t === "img") return "picture";
  const words = (el.text ?? "").trim();
  if (words) {
    if (/^h[1-6]$/.test(el.t)) return "heading";
    if ((el.t === "button" || el.t === "a") && (el.bg || el.border)) return "button";
    return "words";
  }
  return "box";
}
for (const el of all) el.kind = classify(el);

const FEATURE = { icon: "custom-idea", picture: "picture", heading: "value-prop", button: "cta-primary", words: "prose", box: "custom-idea" };

/* ------------------------------------------------------------------ */
/* Readings: the typed fields a captured element gives a node           */
/* ------------------------------------------------------------------ */

/** "1.11111px solid rgb(45, 55, 72)" → its three parts. */
function borderOf(s) {
  const m = /^([\d.]+)px\s+(\w+)\s+(.+)$/.exec(s ?? "");
  return m ? { width: Number(m[1]), style: m[2], colour: m[3].trim() } : null;
}

/** The type, as a part's own override (recreate.ts#fontFrom), scaled to the part that draws it. */
function fontOf(el, featureId) {
  const f = {};
  const fam = familyOf(el.ff ?? "");
  if (fam) f.family = fam;
  const face = (el.ff ?? "").trim().replace(/^["']|["']$/g, "");
  if (face && !GENERIC.test(face)) f.face = face;
  if (el.fs > 0) f.size = round2(el.fs / BASE_PX / (PART_SCALE[featureId] ?? 1));
  const weight = Number(el.fw);
  if (weight) f.weight = weight;
  if (el.ls && el.ls !== "normal" && el.fs > 0) {
    const em = Math.round(((parseFloat(el.ls) || 0) / el.fs) * 1000) / 1000;
    if (Math.abs(em) > 0.005) f.spacing = em;
  }
  if (el.lh > 0 && el.fs > 0) f.leading = round2(el.lh / el.fs);
  return f;
}

/* ------------------------------------------------------------------ */
/* Pictures: the bytes, as the import's "shrink in" carries them         */
/* ------------------------------------------------------------------ */

/**
 * The `picture` part paints `node.texture`, a `look.texture` image layer
 * whose `src` is the picture as a data URL — exactly what ImportFlow.tsx's
 * shrinkIn writes. The bytes come from the file the capture's `src` names,
 * read out of --pictures by file name; without them the layer is left off
 * and the ledger says so.
 */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
const layers = [];
function layerFor(src) {
  const name = basename(new URL(src, cap.url).pathname);
  const file = picturesDir ? join(picturesDir, name) : null;
  if (!file || !existsSync(file)) return null;
  const bytes = readFileSync(file);
  const size = pngSize(bytes);
  const type = size ? "image/png" : "application/octet-stream";
  const id = `tx_${createHash("sha1").update(src).digest("hex").slice(0, 6)}`;
  const layer = {
    id, kind: "image", role: "accent", scale: 100, angle: 0, opacity: 1, contrast: 0, blend: "normal", hue: 0,
    target: "surfaces", pattern: false, cutout: false, tolerance: 0.35, weave: 1, on: true,
    src: `data:${type};base64,${bytes.toString("base64")}`,
  };
  layers.push(layer);
  return { layer, name, size, bytes: bytes.length };
}

/* ------------------------------------------------------------------ */
/* Nodes                                                                */
/* ------------------------------------------------------------------ */

const PAGE_ID = "page_home";
const nodes = [];
const groups = [];
const groupOf = new Map();

/** A group per band of the page: the children of the page's own box. */
for (const el of all) {
  if (el.kind !== "page" || el.t === "body") continue;
  el.kids.forEach((band, i) => {
    const g = { id: `g_${band.t}_${i + 1}`, pageId: PAGE_ID, label: band.t, prompt: "", hue: HUES[i % HUES.length] };
    groups.push(g);
    (function mark(n) { groupOf.set(n, g.id); for (const k of n.kids) mark(k); })(band);
  });
}

const DEFAULT_OF = {
  ls: (v) => v === "normal",
  tt: (v) => v === "none",
  ta: (v) => v === "start",
  minh: (v) => v === "auto",
  maxw: (v) => v === "none" || v === "100%",
  gap: (v) => v === "normal",
  just: (v) => v === "normal",
  align: (v) => v === "normal",
  wrap: (v) => v === "nowrap",
  z: (v) => v === "auto",
};

const TEXT_PROPS = ["color", "fs", "fw", "ff", "lh", "ls", "ta", "tt"];
const LAYOUT_PROPS = ["disp", "dir", "gap", "just", "align", "wrap", "cols"];

let index = 0;
for (const el of all) {
  const { sel, kind } = el;
  note(sel, "t", "field", `the tag picks the part (${kind}) and is kept in from.selector`);
  if (kind === "page") {
    note(sel, "x", "default", "the page's own origin");
    note(sel, "y", "default", "the page's own origin");
    note(sel, "w", "field", "the page's own width: frameWidth");
    note(sel, "h", "nowhere", "the frame's height is derived from the lowest part, never stored");
    if (el.bg) note(sel, "bg", "field", "look.palette.bg");
    for (const p of LAYOUT_PROPS) if (p in el) note(sel, p, DEFAULT_OF[p]?.(el[p]) ? "default" : "nowhere", "the page has no layout field; parts are placed by box");
    if ("minh" in el) note(sel, "minh", DEFAULT_OF.minh(el.minh) ? "default" : "nowhere", "the page's height is derived");
    continue;
  }
  if (kind === "stroke") {
    const icon = (() => { let n = el; while (n && n.t !== "svg") n = n.parent; return n; })();
    for (const p of ["x", "y", "w", "h"]) note(sel, p, "nowhere", "a stroke's box: the icon keeps only its own box, and the path geometry was not captured");
    if (el.color) note(sel, "color", "folded", `the icon's colour.accent (${icon?.sel ?? "svg"})`);
    for (const p of TEXT_PROPS) if (p !== "color" && p in el) note(sel, p, "n/a", "a text property on a stroke");
    if ("minh" in el) note(sel, "minh", DEFAULT_OF.minh(el.minh) ? "default" : "nowhere", "a stroke has no size field");
    continue;
  }

  const featureId = FEATURE[kind];
  index += 1;
  const id = `n_${featureId.replace(/-/g, "")}_${index}`;
  const words = (el.text ?? "").trim();

  /* Words. */
  let content = "";
  if (words) { content = words; note(sel, "text", "field", "content"); }

  /* Colour roles (recreate.ts#colourFrom): bg is what it is painted on, text what its words are set in,
     accent the most coloured thing in it; a button's edge is always its accent, because that is what the part draws the edge in. */
  const colour = {};
  const border = borderOf(el.border);
  if (el.bg) {
    if (PARSEABLE.test(el.bg)) {
      if (kind === "button" && alphaOf(el.bg) >= 1) { colour.accent = el.bg; note(sel, "bg", "field", "colour.accent: a solid button is filled with its accent"); }
      else if (kind === "button") { note(sel, "bg", "nowhere", `a see-through fill (alpha ${alphaOf(el.bg)}): the ghost button paints its accent at 13% instead`); }
      else if (kind === "box") {
        // A plain box is a card, and a card paints its surface: said outright, so the card is the captured colour and not a shade derived from the ground (parts/theme.ts#overrideTheme).
        colour.bg = el.bg; colour.surface = el.bg;
        note(sel, "bg", "field", "colour.bg and colour.surface");
      }
      else { colour.bg = el.bg; note(sel, "bg", kind === "picture" ? "stored" : "field", kind === "picture" ? "colour.bg, under the picture" : "colour.bg"); }
    } else {
      note(sel, "bg", "nowhere", `${el.bg.split("(")[0]}() is not a colour the document reads (parseColor: #hex, rgb, oklch; alpha dropped)`);
    }
  }
  if (el.color) {
    if (kind === "picture") note(sel, "color", "n/a", "a text property on a picture");
    else if (PARSEABLE.test(el.color)) {
      colour.text = el.color;
      note(sel, "color", kind === "button" ? "stored" : "field", kind === "button" ? "colour.text; the button draws its words in the accent, or in the accent's contrast colour" : "colour.text");
    } else note(sel, "color", "nowhere", `${el.color.split("(")[0]}() is not a colour the document reads`);
  }
  if (kind === "icon") {
    const strokes = [];
    (function gather(n) { for (const k of n.kids) { strokes.push(k); gather(k); } })(el);
    const inks = [...new Set(strokes.map((s) => s.color).filter(Boolean))];
    if (inks.length && PARSEABLE.test(inks[0])) colour.accent = inks[0];
    el.strokes = strokes;
    el.inks = inks;
  }
  if (border) {
    if (kind === "button") {
      if (!colour.accent && PARSEABLE.test(border.colour)) colour.accent = border.colour;
      note(sel, "border", colour.accent === border.colour ? "field" : "stored", `colour: colour.accent (the part draws its edge in the accent); width ${round2(border.width)}px and style "${border.style}" have no field — the part draws 2px`);
    } else {
      // colourFrom keeps a chromatic edge as the accent on any part; the part does not draw an edge in it.
      if (!colour.accent && chroma(border.colour) > 0.12 && border.colour !== colour.bg && PARSEABLE.test(border.colour)) colour.accent = border.colour;
      note(sel, "border", colour.accent === border.colour ? "stored" : "nowhere", colour.accent === border.colour ? "colour.accent, which this part does not draw as an edge; width and style have no field" : "a node has no border field");
    }
  }
  // The most coloured thing in it, when nothing above claimed the accent (recreate.ts#colourFrom).
  if (!colour.accent && el.bg && chroma(el.bg) > 0.12 && kind !== "button" && PARSEABLE.test(el.bg)) colour.accent = el.bg;

  /* Type. */
  let font = null;
  if (words) {
    font = fontOf(el, featureId);
    const drawsWeight = kind === "words";
    const drawsLeading = kind !== "heading";
    note(sel, "fs", "field", `font.size ${font.size} × base ${BASE_PX}${PART_SCALE[featureId] !== 1 ? ` × the part's own ${PART_SCALE[featureId]}` : ""} = ${el.fs}px`);
    if ("fw" in el) note(sel, "fw", drawsWeight ? (font.weight > CLAMP.weight[1] ? "stored" : "field") : "stored", drawsWeight ? (font.weight > CLAMP.weight[1] ? `font.weight; the theme clamps it to ${CLAMP.weight[1]}` : "font.weight") : `font.weight; ${featureId} sets its own weight (700)`);
    if ("ff" in el) note(sel, "ff", "field", `font.${font.face ? `face "${font.face}"` : ""}${font.face && font.family ? " and " : ""}${font.family ? `family "${font.family}"` : ""}${!font.face && !font.family ? "" : ""}; the name travels, a web font's file does not`);
    if ("lh" in el) note(sel, "lh", drawsLeading ? "field" : "stored", drawsLeading ? `font.leading ${font.leading} (${el.lh}/${el.fs})` : `font.leading; ${featureId} sets its own line height (1.2)`);
    if ("ls" in el) note(sel, "ls", DEFAULT_OF.ls(el.ls) ? "default" : font.spacing !== undefined ? "field" : "nowhere", DEFAULT_OF.ls(el.ls) ? "" : font.spacing !== undefined ? `font.spacing ${font.spacing}em` : "under the 0.005em the reading keeps");
    if ("ta" in el) note(sel, "ta", DEFAULT_OF.ta(el.ta) ? "default" : "nowhere", DEFAULT_OF.ta(el.ta) ? "" : "alignment is a site-wide format value (type.align), not a part's own");
    if ("tt" in el) note(sel, "tt", DEFAULT_OF.tt(el.tt) ? "default" : "nowhere", DEFAULT_OF.tt(el.tt) ? "" : "no node field for text-transform; heading case is site-wide (type.headingCase)");
    if (!Object.keys(font).length) font = null;
  } else if (kind === "picture") {
    for (const p of TEXT_PROPS) if (p in el && p !== "color") note(sel, p, "n/a", "a text property on a picture");
  }

  /* Where it goes. */
  let link = null;
  if (el.href) {
    // An absolute address as written; a page-relative one made absolute against the page it was read from.
    link = { kind: "url", target: /^https?:/i.test(el.href) ? el.href : new URL(el.href, cap.url).toString() };
    note(sel, "href", kind === "button" ? "field" : "stored", kind === "button" ? "link (url)" : `link (url); ${featureId} is not a linkable part, so the link is written but not pressed`);
  }

  /* The picture. */
  let texture = null;
  let data = "";
  let label;
  if (kind === "picture") {
    const got = layerFor(el.src);
    data = el.src;
    if (got) {
      texture = got.layer.id;
      label = got.name.replace(/\.[^.]+$/, "") || "Picture";
      note(sel, "src", "field", `the bytes, as a look.texture image layer (${got.bytes} bytes) worn via node.texture; the address itself is kept in data as words only`);
      if (got.size && (got.size.w !== el.w || got.size.h !== el.h)) note(sel, "src", "nowhere", `the picture's natural size (${got.size.w}×${got.size.h}) — the layer covers the box`);
    } else {
      label = basename(new URL(el.src, cap.url).pathname);
      note(sel, "src", "nowhere", "the bytes were not supplied (--pictures), so the address is kept in data as words only");
    }
    if ("maxw" in el) note(sel, "maxw", DEFAULT_OF.maxw(el.maxw) ? "default" : "nowhere", "");
  }

  /* Geometry: exactly as captured. */
  for (const p of ["x", "y", "w", "h"]) note(sel, p, "field", p);

  /* What has no field on any part. */
  if (el.pad) note(sel, "pad", "nowhere", "a node has no padding field; a part pads itself");
  if (el.mar) note(sel, "mar", "nowhere", "a node has no margin field; the box already stands where the margin put it");
  for (const p of LAYOUT_PROPS) if (p in el) note(sel, p, DEFAULT_OF[p]?.(el[p]) ? "default" : "nowhere", DEFAULT_OF[p]?.(el[p]) ? "" : "a node has no layout field; a part lays its own contents out");
  if ("minh" in el && kind !== "page") note(sel, "minh", DEFAULT_OF.minh(el.minh) ? "default" : "nowhere", DEFAULT_OF.minh(el.minh) ? "" : "a node has a size, not a constraint on one");
  if ("maxw" in el && kind !== "picture") note(sel, "maxw", DEFAULT_OF.maxw(el.maxw) ? "default" : "nowhere", DEFAULT_OF.maxw(el.maxw) ? "" : "a node has a size, not a constraint on one");
  if (el.pos) {
    const relativeStill = el.pos === "relative" && (el.ins ?? []).every((v) => v === "0px");
    note(sel, "pos", relativeStill ? "default" : "nowhere", relativeStill ? "relative with no offset" : `${el.pos}: a part is placed on the page by its box and scrolls with it; nothing is fixed to the viewport`);
    if (el.ins) note(sel, "ins", relativeStill ? "default" : "nowhere", relativeStill ? "" : "the inset that placed it; its box already carries the result");
    if ("z" in el) note(sel, "z", DEFAULT_OF.z(el.z) ? "default" : "nowhere", DEFAULT_OF.z(el.z) ? "" : "stacking is the order of the nodes array, never a number");
  }

  /* Its name on the board. */
  if (kind === "icon") {
    const kinds = [...new Set(el.strokes.map((s) => s.t))];
    label = `icon · ${el.strokes.length} stroke${el.strokes.length === 1 ? "" : "s"}`;
    data = `${el.strokes.length} stroke${el.strokes.length === 1 ? "" : "s"} (${kinds.join(", ")})${el.inks.length ? ` in ${el.inks.join(", ")}` : ""}; the path geometry was not captured`;
    for (const p of ["x", "y", "w", "h"]) { /* noted above as field */ }
    if ("minh" in el) { /* noted above */ }
  } else if (kind === "picture") {
    /* named above */
  } else if (words) {
    label = cut(words, 36);
  } else {
    label = `${el.t} · ${el.kids.length} inside`;
  }

  /* Options a real part reads. */
  const options = {};
  if (kind === "button") {
    // No radius was captured on any element, and the capture leaves a zero
    // property out (as it does bg and pad), so every corner is square.
    options.shape = "square";
    // Painted solid is solid; painted see-through is the ghost (the part fills a ghost with its accent at 13%); edged only is the outline.
    options.variant = el.bg ? (alphaOf(el.bg) < 1 ? "ghost" : "solid") : "outline";
    options.size = "medium";
  }
  if (kind === "heading") options.turn = "none";

  nodes.push({
    id,
    pageId: PAGE_ID,
    featureId,
    label,
    prompt: `Captured from ${host} as ${sel}. The box, the words, the colours and the type are the ones measured on the page.`,
    content,
    data,
    x: el.x, y: el.y, w: el.w, h: el.h,
    groupId: groupOf.get(el) ?? null,
    options,
    priority: "must",
    custom: featureId === "custom-idea",
    glyph: null,
    hue: null,
    locked: false,
    link,
    colour: Object.keys(colour).length ? colour : null,
    font,
    anim: null,
    animSpeed: 1,
    animDelay: 0,
    animEase: "smooth",
    aura: null,
    auraSize: 1,
    auraStyle: "glow",
    texture,
    sketch: null,
    from: { url: cap.url, host, selector: sel, at },
  });
}

/* ------------------------------------------------------------------ */
/* The page                                                             */
/* ------------------------------------------------------------------ */

note("(capture)", "url", "field", "from.url on every part; pages[0].path");
note("(capture)", "title", "field", "brief.name and pages[0].name");
note("(capture)", "capturedAt", "field", "from.at on every part");
note("(capture)", "viewport[0]", "field", "frameWidth");
note("(capture)", "viewport[1]", "nowhere", "the frame has no viewport height");
note("(capture)", "page[0]", "field", "frameWidth (the same number)");
note("(capture)", "page[1]", "nowhere", "the frame's height is derived from the lowest part");
note("(capture)", "bodyBg", "field", "look.palette.bg; palette.mode from its lightness");
note("(capture)", "bodyColor", "field", "look.palette.text");
note("(capture)", "font", "field", `type.bodyFamily and type.headingFamily as the class "${familyOf(cap.font)}"; the stack itself has no field`);

const doc = {
  pages: [{ id: PAGE_ID, name: cap.title, path: url.pathname, prompt: "", scroll: "inherit" }],
  nodes,
  groups,
  shapes: [],
  format: {
    "type.headingFamily": familyOf(cap.font) ?? "geometric sans",
    "type.bodyFamily": familyOf(cap.font) ?? "system sans",
    "type.baseSize": BASE_PX,
    "layout.radius": 0,
    "palette.mode": light(cap.bodyBg) < 0.5 ? "dark" : "light",
  },
  brief: { name: cap.title, gimmick: "", master: "" },
  look: {
    palette: { bg: cap.bodyBg, text: cap.bodyColor },
    texture: layers,
    target: "page",
    light: DEFAULT_LIGHT,
  },
  motion: [],
  activePageId: PAGE_ID,
  hiddenFeatures: [],
  frameWidth: cap.viewport[0],
  companion: null,
};

mkdirSync(join(outDir, "site"), { recursive: true });
writeFileSync(join(outDir, "site", "document.json"), JSON.stringify(doc, null, 2) + "\n");

/* ------------------------------------------------------------------ */
/* The ledger, said plainly                                             */
/* ------------------------------------------------------------------ */

const byKind = {};
for (const el of all) byKind[el.kind] = (byKind[el.kind] ?? 0) + 1;
console.log(`${all.length} captured elements → ${nodes.length} parts on ${doc.pages.length} page, ${groups.length} groups, ${layers.length} pictures`);
console.log("elements by kind:", JSON.stringify(byKind));
console.log("parts by feature:", JSON.stringify(nodes.reduce((m, n) => ({ ...m, [n.featureId]: (m[n.featureId] ?? 0) + 1 }), {})));

const props = new Map();
for (const l of ledger) {
  const p = props.get(l.prop) ?? { total: 0, to: {}, how: new Map() };
  p.total++;
  p.to[l.to] = (p.to[l.to] ?? 0) + 1;
  if (l.how) p.how.set(`${l.to}: ${l.how}`, (p.how.get(`${l.to}: ${l.how}`) ?? 0) + 1);
  props.set(l.prop, p);
}
console.log("\nWHERE EACH CAPTURED PROPERTY WENT");
for (const [prop, p] of [...props.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`\n${prop}  (${p.total}): ${Object.entries(p.to).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  for (const [how, n] of [...p.how.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${n}× ${how}`);
}
writeFileSync(join(outDir, "ledger.json"), JSON.stringify(ledger, null, 1));

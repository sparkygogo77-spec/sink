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
 * Writes <out-dir>/site/document.json, the pictures under
 * <out-dir>/assets/pictures, and prints the ledger: for every captured
 * property, where it went.
 *
 * WHAT A CAPTURED ELEMENT BECOMES. The part is chosen by what the element
 * itself draws — its own words, its picture, or nothing — never by folding
 * its children into it, because the capture recorded every child with a
 * box of its own and a composite part (a top bar, a row of tiles) draws
 * its children where it likes. So:
 *
 *   body, and the wrapper that is the page's own box   → the page's look
 *   svg                                                 → `box` (an icon); its strokes fold into it
 *   img                                                 → the `picture` part, holding the picture as its own
 *   own text, h1..h6                                    → `value-prop` (a heading)
 *   own text, button or a, painted or edged             → `cta-primary` (a button)
 *   own text, anything else                             → `prose`
 *   no own text                                         → `box`, the plain part that draws nothing of its own
 *
 * WHAT A NODE CARRIES OF ITS BOX. Beside colour roles, type, shape and a
 * link, a node has four optional fields (polio `parts/theme.ts`): `layout`
 * (display, direction, align, justify, gap, wrap, columns), `pad` (four
 * sides), `edge` (width, style, colour) and `text` (align, transform). They
 * are filled from the captured values as recorded, and only where the
 * value says something: a CSS default is left off, so a node that says
 * nothing gets its part alone. A button is the one part that draws its own
 * box — its edge and its padding are the part's — so a button node carries
 * neither, and the ledger says so. Margins and a stroke's geometry stay
 * out, as the format keeps them out.
 *
 * NOTHING WRAPS A CONTAINER. A container is a box holding its children by
 * geometry; there are no groups, because a group is a second object over
 * the same children that takes every click for the whole section.
 *
 * WHAT FIXED MEANS ON A BOARD WITH NO VIEWPORT. The page was captured at
 * scroll 0, so a fixed element's box is its box on the page, and it keeps
 * it: nothing is moved, and the overlaps that were measured — a fixed bar
 * over the top of the column that scrolls beneath it — stay in the
 * geometry, because they are the page's own. What a fixed or absolute
 * element loses without a viewport is only its place in the stack, and the
 * board's stack is the order of the nodes. So the parts that flow are
 * written first, in the capture's order, and every positioned band (an
 * element placed fixed or absolute, with everything inside it) is written
 * after them, lowest z-index first, each band in its own capture order:
 * painted over what scrolls beneath it, exactly as the browser painted it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
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
const PART_SCALE = { "value-prop": 1.6, "cta-primary": 1, prose: 1, box: 1 };
/** The lamp as a new document has it (look.ts#defaultLight). */
const DEFAULT_LIGHT = { on: false, x: 0.5, y: 0.12, height: 0.55, strength: 0.45, lift: 10, warmth: 80, wash: 0 };
/** `parseColor` (look.ts) reads `#hex`, `rgb()` / `rgba()` (alpha dropped) and `oklch()`; nothing else. */
const PARSEABLE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*[,\s]\s*[\d.]+\s*[,\s]\s*[\d.]+|oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+)/i;
/** Generic family keywords that name no face (siteRead.ts#GENERIC). */
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|math|emoji|fangsong|inherit|initial|unset|-apple-system|BlinkMacSystemFont)$/i;
/** What `NodeLayout`, `NodeEdge` and `NodeText` accept (parts/theme.ts). */
const DISPLAYS = new Set(["block", "flex", "grid"]);
const DIRECTIONS = new Set(["row", "column"]);
const EDGE_STYLES = new Set(["solid", "dashed", "dotted", "double", "none"]);
const TEXT_ALIGNS = new Set(["start", "left", "center", "end", "right", "justify"]);
const TEXT_TRANSFORMS = new Set(["none", "uppercase", "lowercase", "capitalize"]);

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
const cut = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

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
all.forEach((el, i) => { el.sel = selectorOf(el); el.order = i; });

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

const FEATURE = { icon: "box", picture: "picture", heading: "value-prop", button: "cta-primary", words: "prose", box: "box" };

/**
 * The positioned band an element paints in: the outermost ancestor, itself
 * included, placed fixed or absolute — or none, for what flows. The page's
 * own box is not a band: it is the page.
 */
const positioned = (el) => el.pos === "fixed" || el.pos === "absolute";
function bandOf(el) {
  let band = null;
  for (let n = el; n && n.kind !== "page"; n = n.parent) if (positioned(n)) band = n;
  return band;
}
const zOf = (el) => (el?.z && el.z !== "auto" ? Number(el.z) || 0 : 0);

/* ------------------------------------------------------------------ */
/* Readings: the typed fields a captured element gives a node           */
/* ------------------------------------------------------------------ */

/** "1.11111px solid rgb(45, 55, 72)" → its three parts, the width as measured. */
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

/**
 * The layout the capture recorded, as `NodeLayout` (parts/theme.ts).
 *
 * Only what the page said: `disp` is written when it was flex or grid (a
 * block says nothing a box does not); `dir` when it was recorded; `gap`,
 * `just`, `align` when not their `normal` default; `wrap` when it wraps;
 * `cols` as the count of tracks the grid was measured with. Each value is
 * passed as the browser reported it, never reinterpreted.
 */
function layoutOf(el) {
  const l = {};
  if (el.disp && DISPLAYS.has(el.disp) && el.disp !== "block") l.display = el.disp;
  if (el.dir && DIRECTIONS.has(el.dir)) l.direction = el.dir;
  if (el.align && !DEFAULT_OF.align(el.align)) l.align = el.align;
  if (el.just && !DEFAULT_OF.just(el.just)) l.justify = el.just;
  if (el.gap && !DEFAULT_OF.gap(el.gap)) { const px = parseFloat(el.gap); if (Number.isFinite(px)) l.gap = px; }
  if (el.wrap && !DEFAULT_OF.wrap(el.wrap)) l.wrap = true;
  if (el.cols && el.disp === "grid") { const n = el.cols.trim().split(/\s+/).length; if (n > 0) l.columns = n; }
  return Object.keys(l).length ? l : null;
}
/** `pad: [top, right, bottom, left]` → `NodePad`. */
const padOf = (el) => (Array.isArray(el.pad) && el.pad.length === 4 ? { top: el.pad[0], right: el.pad[1], bottom: el.pad[2], left: el.pad[3] } : null);
/** The border as measured → `NodeEdge`: the width unrounded, the style as said, the colour as said. */
function edgeOf(border) {
  if (!border) return null;
  const e = { width: border.width };
  if (EDGE_STYLES.has(border.style)) e.style = border.style;
  if (PARSEABLE.test(border.colour)) e.colour = border.colour;
  return e;
}
/** `ta`, `tt` → `NodeText`, when not their defaults. */
function textOf(el) {
  const x = {};
  if (el.ta && !DEFAULT_OF.ta(el.ta) && TEXT_ALIGNS.has(el.ta)) x.align = el.ta;
  if (el.tt && !DEFAULT_OF.tt(el.tt) && TEXT_TRANSFORMS.has(el.tt)) x.transform = el.tt;
  return Object.keys(x).length ? x : null;
}

/* ------------------------------------------------------------------ */
/* Pictures: the part's own, as a reference, with the bytes beside it    */
/* ------------------------------------------------------------------ */

/**
 * A picture is the part's own: `node.picture`, "the picture this part
 * holds, as a reference and never as bytes" (polio `store.ts`). The
 * document keeps the id, the path, the type and the size; the bytes go in
 * the repository at that path, which is where the exact-copy path fetches
 * them from (`repoRun.ts#copyOf`) and where a published site serves them
 * (`staticSite.ts`). The path follows `pictures.ts#put`.
 *
 * Never a `look.texture` layer: a layer is the page's, and one aimed at
 * surfaces is worn by every card-styled part on the board, not by the one
 * that holds it.
 *
 * The bytes come from the file the capture's `src` names, read out of
 * --pictures by file name and written under <out-dir>/assets/pictures;
 * without them the part keeps the address in `data` and the ledger says so.
 */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
const pictures = [];
function pictureFor(src) {
  const name = basename(new URL(src, cap.url).pathname);
  const file = picturesDir ? join(picturesDir, name) : null;
  if (!file || !existsSync(file)) return null;
  const bytes = readFileSync(file);
  const size = pngSize(bytes);
  if (!size) return null;
  const id = `pic_${createHash("sha1").update(src).digest("hex").slice(0, 8)}`;
  const path = `assets/pictures/${id}.png`;
  mkdirSync(join(outDir, "assets", "pictures"), { recursive: true });
  writeFileSync(join(outDir, path), bytes);
  // `from` names where a picture came from and knows two answers, chosen from a machine or drawn; a copied site's pictures are kept as "upload" (FromASite.tsx), so this is too.
  const record = { id, path, type: "image/png", w: size.w, h: size.h, bytes: bytes.length, alt: "", from: "upload" };
  pictures.push(record);
  return { record, name, size, bytes: bytes.length };
}

/* ------------------------------------------------------------------ */
/* Nodes                                                                */
/* ------------------------------------------------------------------ */

const PAGE_ID = "page_home";
const made = [];

const TEXT_PROPS = ["color", "fs", "fw", "ff", "lh", "ls", "ta", "tt"];
const LAYOUT_PROPS = ["disp", "dir", "gap", "just", "align", "wrap", "cols"];
const LAYOUT_FIELD = { disp: "display", dir: "direction", gap: "gap", just: "justify", align: "align", wrap: "wrap", cols: "columns" };

for (const el of all) {
  const { sel, kind } = el;
  note(sel, "t", "field", `the tag picks the part (${kind}) and is kept in from.selector`);
  if (kind === "page") {
    note(sel, "x", "default", "the page's own origin");
    note(sel, "y", "default", "the page's own origin");
    note(sel, "w", "field", "the page's own width: frameWidth");
    note(sel, "h", "nowhere", "the frame's height is derived from the lowest part, never stored");
    if (el.bg) note(sel, "bg", "field", "look.palette.bg");
    for (const p of LAYOUT_PROPS) if (p in el) note(sel, p, DEFAULT_OF[p]?.(el[p]) ? "default" : "nowhere", "the page is not a part; its bands are placed by box");
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
  const words = (el.text ?? "").trim();
  const drawsOwnBox = kind === "button";

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
        // A box paints its colour through the fill; surface is set beside it so a card-styled reading of the node agrees (parts/theme.ts#overrideTheme).
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

  /* The box: layout, padding, edge, text (parts/theme.ts#NodeBox). */
  const layout = layoutOf(el);
  const pad = drawsOwnBox ? null : padOf(el);
  const edge = drawsOwnBox ? null : edgeOf(border);
  const text = textOf(el);

  if (border) {
    if (kind === "button") {
      if (!colour.accent && PARSEABLE.test(border.colour)) colour.accent = border.colour;
      note(sel, "border", colour.accent === border.colour ? "field" : "stored", `colour: colour.accent (the part draws its edge in the accent); width ${round2(border.width)}px and style "${border.style}" stay off — the button draws its own 2px edge, and an edge on the node would draw a second round it`);
    } else {
      note(sel, "border", "field", `edge {width ${border.width}, style ${border.style}, colour}${edge && !edge.colour ? "; the colour is not one the document reads, so the edge takes the site's line colour" : ""}`);
    }
  }
  // The most coloured thing in it, when nothing above claimed the accent (recreate.ts#colourFrom).
  if (!colour.accent && el.bg && chroma(el.bg) > 0.12 && kind !== "button" && PARSEABLE.test(el.bg)) colour.accent = el.bg;

  for (const p of LAYOUT_PROPS) {
    if (!(p in el)) continue;
    if (DEFAULT_OF[p]?.(el[p])) { note(sel, p, "default", ""); continue; }
    if (p === "disp" && el.disp === "block") { note(sel, p, "default", "a block says nothing a box does not"); continue; }
    if (p === "cols" && el.disp !== "grid") { note(sel, p, "nowhere", "tracks on something that is not a grid"); continue; }
    if (layout && LAYOUT_FIELD[p] in layout) {
      // A wrapper laid out flex round a part that fills it moves nothing: the part is the one child and it is the whole box.
      const seen = kind === "box";
      note(sel, p, seen ? "field" : "stored", `layout.${LAYOUT_FIELD[p]}${seen ? "" : ": the part fills the box, so a layout round it has one child and nothing to arrange"}`);
    } else note(sel, p, "nowhere", "not a value NodeLayout takes");
  }
  if (el.pad) {
    if (drawsOwnBox) note(sel, "pad", "nowhere", "the button pads its own words inside its own edge; padding on the node would shrink the button inside the measured box");
    else note(sel, "pad", "field", `pad {${el.pad.join(", ")}}; the theme is set tight so the part adds no padding of its own`);
  }
  if ("ta" in el && kind !== "picture") note(sel, "ta", DEFAULT_OF.ta(el.ta) ? "default" : text?.align ? "field" : "nowhere", DEFAULT_OF.ta(el.ta) ? "" : text?.align ? `text.align ${el.ta}${kind === "button" ? "; the button centres its one line whatever is said" : ""}` : "not a value NodeText takes");
  if ("tt" in el && kind !== "picture") note(sel, "tt", DEFAULT_OF.tt(el.tt) ? "default" : text?.transform ? "field" : "nowhere", DEFAULT_OF.tt(el.tt) ? "" : text?.transform ? `text.transform ${el.tt}` : "not a value NodeText takes");

  /* Type. */
  let font = null;
  if (words) {
    font = fontOf(el, featureId);
    const drawsWeight = kind === "words";
    const drawsLeading = kind !== "heading";
    note(sel, "fs", "field", `font.size ${font.size} × base ${BASE_PX}${PART_SCALE[featureId] !== 1 ? ` × the part's own ${PART_SCALE[featureId]}` : ""} = ${el.fs}px`);
    if ("fw" in el) note(sel, "fw", drawsWeight ? (font.weight > CLAMP.weight[1] ? "stored" : "field") : "stored", drawsWeight ? (font.weight > CLAMP.weight[1] ? `font.weight; the theme clamps it to ${CLAMP.weight[1]}` : "font.weight") : `font.weight; ${featureId} sets its own weight (700)`);
    if ("ff" in el) note(sel, "ff", "field", `font.${font.face ? `face "${font.face}"` : ""}${font.face && font.family ? " and " : ""}${font.family ? `family "${font.family}"` : ""}; the name travels, a web font's file does not`);
    if ("lh" in el) note(sel, "lh", drawsLeading ? "field" : "stored", drawsLeading ? `font.leading ${font.leading} (${el.lh}/${el.fs})` : `font.leading; ${featureId} sets its own line height (1.2)`);
    if ("ls" in el) note(sel, "ls", DEFAULT_OF.ls(el.ls) ? "default" : font.spacing !== undefined ? "field" : "nowhere", DEFAULT_OF.ls(el.ls) ? "" : font.spacing !== undefined ? `font.spacing ${font.spacing}em` : "under the 0.005em the reading keeps");
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
  let picture = null;
  let data = "";
  let label;
  if (kind === "picture") {
    const got = pictureFor(el.src);
    data = el.src;
    if (got) {
      picture = got.record;
      label = got.name.replace(/\.[^.]+$/, "") || "Picture";
      note(sel, "src", "field", `node.picture: a reference to ${got.record.path} (${got.bytes} bytes, ${got.size.w}×${got.size.h}), the bytes committed beside the document; the address itself is kept in data as words only`);
    } else {
      label = basename(new URL(el.src, cap.url).pathname);
      note(sel, "src", "nowhere", "the bytes were not supplied (--pictures), so the address is kept in data as words only");
    }
    if ("maxw" in el) note(sel, "maxw", DEFAULT_OF.maxw(el.maxw) ? "default" : "nowhere", "");
  }

  /* Geometry: exactly as captured. */
  for (const p of ["x", "y", "w", "h"]) note(sel, p, "field", p);

  /* What has no field on any part. */
  if (el.mar) note(sel, "mar", "nowhere", "a node has no margin field; the box already stands where the margin put it");
  if ("minh" in el && kind !== "page") note(sel, "minh", DEFAULT_OF.minh(el.minh) ? "default" : "nowhere", DEFAULT_OF.minh(el.minh) ? "" : "a node has a size, not a constraint on one");
  if ("maxw" in el && kind !== "picture") note(sel, "maxw", DEFAULT_OF.maxw(el.maxw) ? "default" : "nowhere", DEFAULT_OF.maxw(el.maxw) ? "" : "a node has a size, not a constraint on one");
  if (el.pos) {
    const relativeStill = el.pos === "relative" && (el.ins ?? []).every((v) => v === "0px");
    if (relativeStill) {
      note(sel, "pos", "default", "relative with no offset");
      if (el.ins) note(sel, "ins", "default", "");
      if ("z" in el) note(sel, "z", DEFAULT_OF.z(el.z) ? "default" : "nowhere", DEFAULT_OF.z(el.z) ? "" : "stacking is the order of the nodes array, never a number");
    } else {
      note(sel, "pos", "field", `${el.pos}: the box stays where it was measured, and the band is written after the parts that flow, so it paints over them as the browser did`);
      if (el.ins) note(sel, "ins", "nowhere", "the inset that placed it; its box already carries the result");
      if ("z" in el) note(sel, "z", DEFAULT_OF.z(el.z) ? "default" : "field", DEFAULT_OF.z(el.z) ? "" : "the order of the positioned bands in the nodes array; the number itself is not kept");
    }
  }

  /* Its name on the board. */
  if (kind === "icon") {
    const kinds = [...new Set(el.strokes.map((s) => s.t))];
    label = `icon · ${el.strokes.length} stroke${el.strokes.length === 1 ? "" : "s"}`;
    data = `${el.strokes.length} stroke${el.strokes.length === 1 ? "" : "s"} (${kinds.join(", ")})${el.inks.length ? ` in ${el.inks.join(", ")}` : ""}; the path geometry was not captured`;
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

  made.push({
    el,
    band: bandOf(el),
    node: {
      id: "",
      pageId: PAGE_ID,
      featureId,
      label,
      prompt: `Captured from ${host} as ${sel}. The box, the words, the colours and the type are the ones measured on the page.`,
      content,
      data,
      x: el.x, y: el.y, w: el.w, h: el.h,
      groupId: null,
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
      texture: null,
      ...(picture ? { picture } : {}),
      sketch: null,
      from: { url: cap.url, host, selector: sel, at },
      ...(layout ? { layout } : {}),
      ...(pad ? { pad } : {}),
      ...(edge ? { edge } : {}),
      ...(text ? { text } : {}),
    },
  });
}

/*
 * The stack. What flows is written first, in the capture's order; each
 * positioned band follows, lowest z-index first and otherwise in the order
 * the bands were captured, with everything inside it in its own order.
 */
const bands = [...new Set(made.map((m) => m.band).filter(Boolean))];
const bandRank = new Map(bands.sort((a, b) => zOf(a) - zOf(b) || a.order - b.order).map((b, i) => [b, i + 1]));
made.sort((a, b) => (a.band ? bandRank.get(a.band) : 0) - (b.band ? bandRank.get(b.band) : 0) || a.el.order - b.el.order);
const nodes = made.map((m, i) => ({ ...m.node, id: `n_${m.node.featureId.replace(/-/g, "")}_${i + 1}` }));

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
  // No groups: a container is a box holding its children by geometry, and nothing else wraps them.
  groups: [],
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
    // Never a picture: a page layer is worn by every part, not by the one that holds it.
    texture: [],
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
console.log(`${all.length} captured elements → ${nodes.length} parts on ${doc.pages.length} page, ${doc.groups.length} groups, ${pictures.length} pictures${pictures.length ? ` (${pictures.map((p) => p.path).join(", ")})` : ""}`);
console.log("elements by kind:", JSON.stringify(byKind));
console.log("parts by feature:", JSON.stringify(nodes.reduce((m, n) => ({ ...m, [n.featureId]: (m[n.featureId] ?? 0) + 1 }), {})));
console.log("parts carrying a box field:", JSON.stringify({ layout: nodes.filter((n) => n.layout).length, pad: nodes.filter((n) => n.pad).length, edge: nodes.filter((n) => n.edge).length, text: nodes.filter((n) => n.text).length }));
console.log(`paint order: ${made.filter((m) => !m.band).length} parts that flow, then ${bands.length} positioned band${bands.length === 1 ? "" : "s"}: ${bands.map((b) => `${b.t} (${b.pos}, z ${b.z ?? "auto"}, ${made.filter((m) => m.band === b).length} parts)`).join(", ")}`);

/*
 * Overlaps in the measured geometry: two parts whose boxes cross with
 * neither holding the other. A child inside its parent is not one; a child
 * poking out of its parent is. They are the page's own and are kept; the
 * paint order above is what settles which shows.
 */
const holds = (o, i) => o.x <= i.x && o.y <= i.y && o.x + o.w >= i.x + i.w && o.y + o.h >= i.y + i.h;
const isAncestor = (a, b) => { for (let n = b.parent; n; n = n.parent) if (n === a) return true; return false; };
const overlaps = [];
for (let i = 0; i < made.length; i++) {
  for (let j = i + 1; j < made.length; j++) {
    const a = made[i].el, b = made[j].el;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w <= 0 || h <= 0 || holds(a, b) || holds(b, a)) continue;
    const kin = isAncestor(a, b) || isAncestor(b, a);
    overlaps.push({ a, b, w, h, kin, positioned: !kin && !!(made[i].band || made[j].band) && made[i].band !== made[j].band });
  }
}
console.log(`\noverlaps in the measured geometry: ${overlaps.length} — ${overlaps.filter((o) => o.positioned).length} a positioned band over what flows beneath it, ${overlaps.filter((o) => o.kin).length} a child poking out of its own parent`);
for (const o of overlaps) console.log(`    ${o.a.sel}  ×  ${o.b.sel}  (${o.w}×${o.h}px${o.positioned ? ", the band paints on top" : o.kin ? ", the child paints on top" : ""})`);

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

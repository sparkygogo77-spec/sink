#!/usr/bin/env node
/**
 * The page captures become the Builder's document.
 *
 * A capture is a mechanical dump of a live page: every visible element
 * with its real box, its own text, and its computed styles, taken from the
 * running browser (`capture-route.mjs`). `routes.json` lists the pages the
 * site has — read from its source, not guessed — and where each capture
 * is. This turns them into `site/document.json`, the file the Builder's
 * exact-copy path loads whole (polio: `repoRun.ts` reads it out of a
 * repository, `store.ts#loadDoc` → `docTake.ts#takeDoc` lays it over the
 * board). Written against polio trunk b73babb; every field name is read
 * from `store.ts`, `parts/theme.ts`, `parts/types.ts`, `fonts.ts` and
 * `vector.ts` there and cited where it is used.
 *
 * Every rule here is a declaration keyed on the capture's own tags and
 * numbers, in the manner of polio's `recreate.ts`. Nothing is described to
 * a model, and nothing is invented where nothing was measured: a property
 * the document format cannot hold is written down as such in the ledger
 * this prints, rather than approximated.
 *
 *   node capture-to-document.mjs <routes.json> <out-dir> [--assets <dir>]
 *
 * Writes <out-dir>/site/document.json, the pictures under
 * <out-dir>/assets/pictures, and prints the ledger: for every captured
 * property, where it went. `--assets` is where the captures' bytes were
 * saved (pictures and font files, by file name); without it a picture is
 * kept as its address and a face as its address, and the ledger says so.
 *
 * WHAT A CAPTURED ELEMENT BECOMES. The part is chosen by what the element
 * itself draws — its own words, its picture, its strokes, or nothing —
 * never by folding its children into it, because the capture recorded
 * every child with a box of its own and a composite part (a top bar, a
 * row of tiles) draws its children where it likes. So:
 *
 *   body, and the wrapper that is the page's own box   → the page's look
 *   svg whose strokes were captured with their `d`     → `drawn-icon`, holding them as `node.vector`
 *   svg whose strokes were not                         → `box` (an icon with no geometry)
 *   img                                                 → the `picture` part, holding the picture as its own
 *   own text, h1..h6                                    → `value-prop` (a heading)
 *   own text, button or a, painted or edged             → `cta-primary` (a button)
 *   own text, anything else                             → `prose`
 *   no text of its own                                  → `box`, the plain part that draws nothing of its own
 *
 * WHAT A THING IS, BEFORE WHAT IT LOOKS LIKE. Each captured element carries
 * the role the browser's accessibility tree computed for it (`role`), its
 * accessible name (`name`), its states (`state`) and, for a field, its
 * `type` and `placeholder`. The part is chosen from the role first —
 * heading, paragraph, image, button — and from shape only where the tree
 * gave none. Where the library has no part for a role (link, navigation,
 * banner, main, complementary, contentinfo, list, listitem, textbox) the
 * look stays exactly what the shape rule draws today, and the role still
 * travels: in the label every surface shows, in the prompt the blueprint
 * writes, and — for the interactive roles, textbox, button and link — in
 * `data`, which the blueprint writes under "What the backend must
 * provide", with the type, placeholder, name and state. His search field
 * is a `textbox` named "Ask or search..." with that placeholder; the page
 * declares no search role, so none is written, and the placeholder travels
 * as evidence rather than as a decision. A typed field for the role would
 * be cleaner than label, prompt and data; that is a change to polio's
 * `StudioNode`, not to this converter.
 *
 * A BUTTON IS A BUTTON, IN ITS OWN CLOTHES (polio trunk b73babb). Every
 * element the tree calls a button, its words on it or in a child (the
 * eight entries of his sidebar: a `button` holding an `svg` and a `span`),
 * is `cta-primary` carrying those words. The part's rule on trunk is "the
 * node where the node spoke, the part's own where it did not"
 * (parts/theme.ts#NodeSaid, parts/Cta.tsx), so a button node here says
 * everything the capture measured, and the part stands aside for each:
 *   colour.text   its words' colour — the part draws them in it
 *   colour.bg     its fill, when it had one — `Fill` paints it, the part paints nothing over it
 *   font          size, weight, face — `t.fontWeight` is only ever the node's
 *   text.align    left, when it was — the part sets its words there rather than centred
 *   edge          as measured, or an edge of none — the wrapper draws it and the part draws none,
 *                 where before it drew a 2px edge of its own (or a transparent one 2px wide)
 *   pad           where its words start inside it: the measured padding, or, when the words were
 *                 in a child beside an icon, the child's own offset, so the words land where the
 *                 page put them and the icon (its own part) in the gap.
 *                 The wrapper does not paint a fill, and `Fill` paints the node's inside the
 *                 padding, so a padded button WITH a fill shows it inset by the padding: a
 *                 gap on the polio side, said here rather than worked around.
 * The span that held the words is folded into the button's content; the
 * icon beside it stays its own drawn-icon at its own box. Where the button
 * had no fill, `variant` is `outline`, the one variant that paints nothing,
 * and the edge of none keeps it edgeless. The ledger says which of these
 * each button said.
 *
 * A BOX CARRIES ITS OWN ARRANGEMENT. `StudioNode` has four optional box
 * fields (parts/theme.ts#NodeBox, store.ts): `layout` (display, direction,
 * align, justify, gap, wrap, columns), `pad` (four sides), `edge` (width,
 * style, colour) and `text` (align, transform). They are filled from the
 * captured values as recorded, and only where the value says something: a
 * CSS default is left off, so a node that says nothing gets its part
 * alone. A button is the one part that draws its own box — its edge and
 * its padding are the part's — so a button node carries neither, and the
 * ledger says so. Margins and a stroke's geometry stay out of the box
 * fields, as the format keeps them out.
 *
 * FACES COME THROUGH ONE TO ONE, OR SAY WHY NOT (polio `fonts.ts`). The
 * captures carry the pages' `@font-face` rules; the faces some part is
 * set in (`font.face`) are carried into `look.fonts` as `CarriedFont`
 * entries, Latin subsets only, the bytes as a data URI when the file is
 * in --assets, by the rules `carryFaces` applies, transcribed. A generic
 * keyword (`ui-monospace`) is the machine's own face and cannot be
 * carried; it is named in the ledger.
 *
 * NOTHING WRAPS A CONTAINER. A container is a box holding its children by
 * geometry; there are no groups, because a group is a second object over
 * the same children that takes every click for the whole section.
 *
 * WHAT FIXED MEANS ON A BOARD WITH NO VIEWPORT. Each page was captured at
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
 *
 * WHERE A LINK GOES. An `href` whose path is one of the site's routes
 * becomes `{ kind: "page", target: <that page's id> }` — a page in the
 * document, not an address on the web (LiveSite.tsx#resolvePageLink reads
 * the id). Any other address stays `{ kind: "url" }`; a bare `#` is the
 * page itself and goes nowhere. A sidebar button leads to the page its
 * section was captured as, by the `sections` map in routes.json.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

/* ------------------------------------------------------------------ */
/* Arguments                                                            */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const routesPath = args[0];
const outDir = args[1];
const assetsDir = (() => { const i = args.indexOf("--assets"); return i >= 0 ? args[i + 1] : null; })();
if (!routesPath || !outDir) {
  console.error("usage: node capture-to-document.mjs <routes.json> <out-dir> [--assets <dir>]");
  process.exit(2);
}
const routes = JSON.parse(readFileSync(routesPath, "utf8"));
const routesDir = dirname(resolve(routesPath));

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
/** Generic family keywords that name no face (fonts.ts#GENERIC_FACES). */
const GENERIC = /^(ui-monospace|ui-sans-serif|ui-serif|ui-rounded|system-ui|-apple-system|BlinkMacSystemFont|monospace|sans-serif|serif|cursive|fantasy|math|emoji|fangsong|inherit|initial|unset)$/i;
/** What `NodeLayout`, `NodeEdge` and `NodeText` accept (parts/theme.ts). */
const DISPLAYS = new Set(["block", "flex", "grid"]);
const DIRECTIONS = new Set(["row", "column"]);
const EDGE_STYLES = new Set(["solid", "dashed", "dotted", "double", "none"]);
const TEXT_ALIGNS = new Set(["start", "left", "center", "end", "right", "justify"]);
const TEXT_TRANSFORMS = new Set(["none", "uppercase", "lowercase", "capitalize"]);
/** fonts.ts: the most one file may weigh, all of a page's together, and how many rules of one family are carried. */
const FONT_FILE_MAX = 600 * 1024;
const FONT_TOTAL_MAX = 2 * 1024 * 1024;
const FONT_RULES_MAX = 4;
/** vector.ts: how many paths an icon keeps before merging (ICON_PATHS); DrawnIcon's `paths` option goes to 24. */
const ICON_PATHS_MAX = 24;

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
  if (/^rgba?\(/i.test(s)) {
    const nums = inner.split(/[\s,/]+/).filter(Boolean);
    return nums.length >= 4 ? pct(nums[3]) : 1;
  }
  const slash = inner.indexOf("/");
  return slash >= 0 ? pct(inner.slice(slash + 1).trim()) : 1;
}
const isNone = (v) => !v || v === "none" || v === "transparent" || v === "rgba(0, 0, 0, 0)";

/**
 * Any colour the browser writes, as sRGB [r, g, b, a] with r, g, b in 0..255:
 * rgb(), rgba(), and the oklab() / oklch() a Tailwind v4 `/10` tint computes to.
 * Null for anything else.
 */
function srgbaOf(v) {
  const s = (v ?? "").trim();
  const c = rgba(s);
  if (c && /^rgba?\(/i.test(s)) return c;
  const m = /^(oklab|oklch)\(\s*([-\d.]+%?)\s+([-\d.]+%?)\s+([-\d.]+)(?:deg)?%?\s*(?:\/\s*[\d.]+%?\s*)?\)$/i.exec(s);
  if (!m) return null;
  const num = (x, pctOf) => (x.endsWith("%") ? (Number(x.slice(0, -1)) / 100) * pctOf : Number(x));
  const L = num(m[2], 1);
  let a, b;
  if (m[1].toLowerCase() === "oklab") { a = num(m[3], 0.4); b = num(m[4], 0.4); }
  else { const C = num(m[3], 0.4), h = (Number(m[4]) * Math.PI) / 180; a = C * Math.cos(h); b = C * Math.sin(h); }
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const ss = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss,
  ];
  const gamma = (x) => { const y = Math.min(1, Math.max(0, x)); return 255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055); };
  return [...lin.map(gamma), alphaOf(s)];
}
/** `fg` laid over an opaque `bg`, as the browser composites: in sRGB, by fg's alpha. */
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
const rgbText = (c) => `rgb(${c.slice(0, 3).map((x) => Math.round(x)).join(", ")})`;

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
let notePage = "";
const note = (sel, prop, to, how) => ledger.push({ page: notePage, sel, prop, to, how });

/* ------------------------------------------------------------------ */
/* Pictures: the part's own, as a reference, with the bytes beside it    */
/* ------------------------------------------------------------------ */

/**
 * A picture is the part's own: `node.picture`, "the picture this part
 * holds, as a reference and never as bytes" (polio `store.ts`). The
 * document keeps the id, the path, the type and the size; the bytes go in
 * the repository at that path, which is where the exact-copy path fetches
 * them from (`repoRun.ts#copyOf`) and where a published site serves them
 * (`staticSite.ts`). The path follows `pictures.ts#put`. Never a
 * `look.texture` layer: a layer is the page's, and one aimed at surfaces
 * is worn by every card-styled part on the board.
 */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
const pictures = new Map();
function pictureFor(src, pageUrl) {
  const name = basename(new URL(src, pageUrl).pathname);
  const file = assetsDir ? join(assetsDir, name) : null;
  if (!file || !existsSync(file)) return null;
  if (pictures.has(src)) return pictures.get(src);
  const bytes = readFileSync(file);
  const size = pngSize(bytes);
  if (!size) return null;
  const id = `pic_${createHash("sha1").update(src).digest("hex").slice(0, 8)}`;
  const path = `assets/pictures/${id}.png`;
  mkdirSync(join(outDir, "assets", "pictures"), { recursive: true });
  writeFileSync(join(outDir, path), bytes);
  // `from` names where a picture came from and knows two answers, chosen from a machine or drawn; a copied site's pictures are kept as "upload" (FromASite.tsx), so this is too.
  const record = { id, path, type: "image/png", w: size.w, h: size.h, bytes: bytes.length, alt: "", from: "upload" };
  const got = { record, name, size, bytes: bytes.length };
  pictures.set(src, got);
  return got;
}

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
 * Only what the page said: `disp` is written when it was flex or grid (a
 * block says nothing a box does not); `dir` when it was recorded; `gap`,
 * `just`, `align` when not their `normal` default; `wrap` when it wraps;
 * `cols` as the count of tracks the grid was measured with.
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

/**
 * An icon's strokes as `DrawnVector` (vector.ts): the svg's viewBox and
 * each stroke's `d` as captured, with `share` — how much of the icon's box
 * the stroke covers — from the stroke's own measured box against the
 * svg's, floored for a thin line the way `readVector` floors it, so no
 * stroke is dropped as noise. `from` says it was captured, not drawn.
 */
function vectorOf(el, strokes) {
  if (!el.vb) return null;
  const area = Math.max(1, el.w * el.h);
  const side = Math.max(1, el.w, el.h);
  const paths = strokes.filter((s) => s.d).map((s) => {
    const span = Math.max(s.w, s.h) / side;
    return { d: s.d, share: Math.min(1, Math.max((s.w * s.h) / area, span * span * 0.25)) };
  });
  return paths.length ? { viewBox: el.vb, paths, from: "captured" } : null;
}

/* ------------------------------------------------------------------ */
/* Links                                                                */
/* ------------------------------------------------------------------ */

const site = new URL(routes.site);
const pageByRoute = new Map(routes.pages.filter((p) => !p.click).map((p) => [p.route, p.id]));
/** An href → where it goes in the document: a page, an address, or nowhere. */
function linkOf(href, pageUrl) {
  if (!href) return { link: null, how: null };
  if (href.trim() === "#" || href.trim() === "") return { link: null, how: "an anchor on the page itself; it goes nowhere" };
  let u;
  try { u = new URL(href, pageUrl); } catch { return { link: null, how: "not an address" }; }
  if (u.host === site.host && pageByRoute.has(u.pathname)) {
    const id = pageByRoute.get(u.pathname);
    return { link: { kind: "page", target: id }, how: `link (page ${id}): ${u.pathname} is a route of the site, captured as a page of the document` };
  }
  if (u.host === site.host) return { link: { kind: "url", target: u.toString() }, how: `link (url): ${u.pathname} is on the site but not a route in its source, so the address is kept` };
  return { link: { kind: "url", target: u.toString() }, how: "link (url): an address off the site" };
}

/* ------------------------------------------------------------------ */
/* One capture → its page's nodes                                       */
/* ------------------------------------------------------------------ */

const STROKE_TAGS = new Set(["path", "polyline", "polygon", "line", "circle", "ellipse", "rect", "g", "use"]);
const TEXT_PROPS = ["color", "fs", "fw", "ff", "lh", "ls", "ta", "tt"];
const LAYOUT_PROPS = ["disp", "dir", "gap", "just", "align", "wrap", "cols"];
const LAYOUT_FIELD = { disp: "display", dir: "direction", gap: "gap", just: "justify", align: "align", wrap: "wrap", cols: "columns" };
const FEATURE = { icon: "drawn-icon", "icon-blind": "box", picture: "picture", heading: "value-prop", button: "cta-primary", words: "prose", box: "box" };

function convert(pageDef, cap) {
  notePage = pageDef.id;
  const PAGE_ID = pageDef.id;
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

  const isPageBox = (el) => el.x === 0 && el.y === 0 && el.w === page.w && Math.abs(el.h - page.h) <= 1;
  const within = (el, tag) => { for (let n = el.parent; n; n = n.parent) if (n.t === tag) return true; return false; };
  const wordsWithin = (el) => { const out = []; (function g(n) { if (n.text) out.push(n.text.trim()); for (const k of n.kids) g(k); })(el); return out.join(" ").replace(/\s+/g, " ").trim(); };

  /** What each element becomes. Declared, in order, most particular first. */
  /**
   * What each element becomes. The role first, where the tree computed
   * one; the shape only where it did not. A role the library has no part
   * for keeps the shape's part and carries the role beside it.
   */
  function classify(el) {
    if (el.t === "body") return "page";
    if (el.parent?.t === "body" && isPageBox(el)) return "page";
    if (STROKE_TAGS.has(el.t) || (el.parent && el.parent.kind === "stroke")) return "stroke";
    if (el.t === "svg") { let d = false; (function g(n) { for (const k of n.kids) { if (k.d) d = true; g(k); } })(el); return d && el.vb ? "icon" : "icon-blind"; }
    if (el.t === "img" || el.role === "image") return "picture";
    const words = (el.text ?? "").trim();
    if (el.role === "heading" && words) return "heading";
    if (el.role === "paragraph" && words) return "words";
    // A button by role with words on it, its own or a child's: the button part, in the captured clothes (see the head of this file).
    if (el.role === "button" && wordsWithin(el)) return "button";
    // The words a button holds in a child are the button's; the child is folded into it.
    if (el.parent && el.parent.kind === "button" && words && !el.kids.length) return "folded";
    if (words) {
      if (/^h[1-6]$/.test(el.t)) return "heading";
      if ((el.t === "button" || el.t === "a") && (el.bg || el.border)) return "button";
      return "words";
    }
    return "box";
  }
  for (const el of all) el.kind = classify(el);
  const buttonWords = (el) => (el.text ?? "").trim() || wordsWithin(el);

  const positioned = (el) => el.pos === "fixed" || el.pos === "absolute";
  function bandOf(el) {
    let band = null;
    for (let n = el; n && n.kind !== "page"; n = n.parent) if (positioned(n)) band = n;
    return band;
  }
  const zOf = (el) => (el?.z && el.z !== "auto" ? Number(el.z) || 0 : 0);

  const made = [];
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
    if (kind === "folded") {
      note(sel, "text", "folded", `the button's content (${el.parent.sel})`);
      for (const p of ["x", "y", "w", "h"]) note(sel, p, "folded", "the button's box holds it; where the words start is the button's pad");
      for (const p of TEXT_PROPS) if (p in el) note(sel, p, "folded", `the button's ${p === "color" ? "colour.text" : "font"}`);
      for (const p of [...LAYOUT_PROPS, "minh", "maxw", "mar", "pad"]) if (p in el) note(sel, p, "folded", "");
      continue;
    }
    if (kind === "stroke") {
      const icon = (() => { let n = el; while (n && n.t !== "svg") n = n.parent; return n; })();
      const drawn = icon?.kind === "icon";
      for (const p of ["x", "y", "w", "h"]) note(sel, p, drawn ? "folded" : "nowhere", drawn ? `vector.paths[].share: how much of the icon's box this stroke covers (${icon.sel})` : "a stroke's box: the icon keeps only its own box, and the path geometry was not captured");
      if (el.d) note(sel, "d", drawn ? "folded" : "nowhere", drawn ? `vector.paths[].d, as captured (${icon.sel})` : "the icon has no viewBox to draw it in");
      if (el.color) note(sel, "color", "folded", `the icon's colour.text (${icon?.sel ?? "svg"}): drawn-icon draws its paths in the text role`);
      if ("stroke" in el) note(sel, "stroke", drawn ? "folded" : "nowhere", drawn ? `the icon's "drawn as" option: an outline when the stroke is painted, a fill when only the fill is (${icon.sel})` : "");
      if ("fill" in el) note(sel, "fill", drawn ? "folded" : "nowhere", drawn ? "with stroke, above" : "");
      if ("sw" in el) note(sel, "sw", "nowhere", "drawn-icon draws every outline at 2 units; the measured stroke width is not kept");
      for (const p of TEXT_PROPS) if (p !== "color" && p in el) note(sel, p, "n/a", "a text property on a stroke");
      if ("minh" in el) note(sel, "minh", DEFAULT_OF.minh(el.minh) ? "default" : "nowhere", "a stroke has no size field");
      continue;
    }

    const featureId = FEATURE[kind];
    const words = kind === "button" ? buttonWords(el) : (el.text ?? "").trim();
    /* A button's type is read off the element that held its words: the child span, when the words were in one. */
    const wordsEl = kind === "button" && !(el.text ?? "").trim() ? all.find((k) => k.parent === el && k.kind === "folded") ?? el : el;
    const drawsOwnBox = false;

    /* Words. */
    let content = "";
    if (words) { content = words; note(sel, "text", "field", kind === "button" && wordsEl !== el ? "content, from the child that held the words" : "content"); }

    /* Colour roles (recreate.ts#colourFrom): bg is what it is painted on, text what its words are set in,
       accent the most coloured thing in it; a button's edge is always its accent, because that is what the part draws the edge in. */
    const colour = {};
    const border = borderOf(el.border);
    /*
     * A translucent fill is carried as the colour it looks. The document reads
     * #hex, rgb() and oklch() and drops alpha, so `bg-[#00ff00]/10` (the
     * browser writes oklab(… / 0.1)) was dropped outright and his active
     * time-range button drew as an empty outline. It is composited here, in
     * sRGB as the browser does, over what is painted behind it: the nearest
     * ancestor's fill, itself composited if it is translucent, else the
     * page's ground. Measured values only; the ledger says it was done.
     */
    const behind = (n) => {
      for (let p = n.parent; p; p = p.parent) {
        const c = !isNone(p.bg) && srgbaOf(p.bg);
        if (c && c[3] > 0) return c[3] >= 1 ? c : over(c, behind(p));
      }
      return srgbaOf(cap.bodyBg) ?? [255, 255, 255, 1];
    };
    let fill = el.bg;
    if (el.bg && !isNone(el.bg) && (alphaOf(el.bg) < 1 || !PARSEABLE.test(el.bg))) {
      const c = srgbaOf(el.bg);
      if (c && c[3] > 0) {
        fill = rgbText(c[3] >= 1 ? c : over(c, behind(el)));
        note(sel, "bg", "field", `${el.bg} carried as ${fill}: ${c[3] >= 1 ? "converted" : "composited over what is painted behind it"}, because the document reads no alpha and no ${el.bg.split("(")[0]}()`);
      }
    }
    if (fill) {
      if (PARSEABLE.test(fill)) {
        if (kind === "button") { colour.bg = fill; colour.accent = fill; note(sel, "bg", "field", "colour.bg: the node's own fill, painted by Fill; the button part paints nothing over a fill the node named"); }
        else if (kind === "box") {
          colour.bg = fill; colour.surface = fill;
          note(sel, "bg", "field", "colour.bg and colour.surface");
        }
        else { colour.bg = fill; note(sel, "bg", kind === "picture" ? "stored" : "field", kind === "picture" ? "colour.bg, under the picture" : "colour.bg"); }
      } else {
        note(sel, "bg", "nowhere", `${el.bg.split("(")[0]}() is not a colour the document reads (parseColor: #hex, rgb, oklch; alpha dropped)`);
      }
    }
    const ink = kind === "button" ? wordsEl.color ?? el.color : el.color;
    if (ink) {
      if (kind === "picture") note(sel, "color", "n/a", "a text property on a picture");
      else if (PARSEABLE.test(ink)) {
        colour.text = ink;
        note(sel, "color", "field", kind === "button" ? "colour.text: the button draws its words in a colour the node named" : "colour.text");
      } else note(sel, "color", "nowhere", `${ink.split("(")[0]}() is not a colour the document reads`);
    }
    let strokes = [];
    let inks = [];
    let lineIcon = true;
    if (kind === "icon" || kind === "icon-blind") {
      (function gather(n) { for (const k of n.kids) { strokes.push(k); gather(k); } })(el);
      inks = [...new Set(strokes.map((s) => (isNone(s.stroke) ? s.fill : s.stroke) || s.color).filter((c) => c && !isNone(c)))];
      lineIcon = strokes.some((s) => !isNone(s.stroke)) || strokes.every((s) => isNone(s.fill));
      if (inks.length && PARSEABLE.test(inks[0])) colour.text = inks[0];
      else if (inks.length) note(sel, "color", "nowhere", `${inks[0].split("(")[0]}() is not a colour the document reads; the icon takes the site's text colour`);
    }

    /* The box: layout, padding, edge, text (parts/theme.ts#NodeBox). */
    const layout = layoutOf(el);
    /* A button whose words were in a child: its words start where the child started, not where its padding ends — the icon sits in the difference. */
    const pad = kind === "button" && wordsEl !== el
      ? { ...(padOf(el) ?? { top: 0, right: 0, bottom: 0 }), left: Math.max(0, wordsEl.x - el.x) }
      : padOf(el);
    const edge = kind === "button" ? (edgeOf(border) ?? { width: 0, style: "none" }) : edgeOf(border);
    const text = kind === "button" ? (textOf(wordsEl) ?? textOf(el)) : textOf(el);

    if (border) {
      if (kind === "button") {
        if (!colour.accent && PARSEABLE.test(border.colour)) colour.accent = border.colour;
        note(sel, "border", "field", `edge {width ${border.width}, style ${border.style}, colour}: the wrapper draws it and the button part draws none of its own`);
      } else {
        note(sel, "border", "field", `edge {width ${border.width}, style ${border.style}, colour}${edge && !edge.colour ? "; the colour is not one the document reads, so the edge takes the site's line colour" : ""}`);
      }
    }
    if (!colour.accent && el.bg && chroma(el.bg) > 0.12 && kind !== "button" && PARSEABLE.test(el.bg)) colour.accent = el.bg;

    for (const p of LAYOUT_PROPS) {
      if (!(p in el)) continue;
      if (DEFAULT_OF[p]?.(el[p])) { note(sel, p, "default", ""); continue; }
      if (p === "disp" && el.disp === "block") { note(sel, p, "default", "a block says nothing a box does not"); continue; }
      if (p === "cols" && el.disp !== "grid") { note(sel, p, "nowhere", "tracks on something that is not a grid"); continue; }
      if (layout && LAYOUT_FIELD[p] in layout) {
        const seen = kind === "box";
        note(sel, p, seen ? "field" : "stored", `layout.${LAYOUT_FIELD[p]}${seen ? "" : ": the part fills the box, so a layout round it has one child and nothing to arrange"}`);
      } else note(sel, p, "nowhere", "not a value NodeLayout takes");
    }
    if (kind === "button" && wordsEl !== el) note(sel, "pad", "field", `pad {${[pad.top, pad.right, pad.bottom, pad.left].join(", ")}}: the left is where the words were measured to start inside the button, the icon in the difference; the rest is the measured padding`);
    else if (el.pad) note(sel, "pad", "field", `pad {${el.pad.join(", ")}}; the theme is set tight so the part adds no padding of its own${kind === "button" ? "; the button's words start where the page started them" : ""}`);
    if (kind === "button" && !border) note(sel, "border", "field", "edge {none}: the page drew no edge, and the button part draws a 2px edge of its own unless the node names one, so none is named");
    if ("ta" in el && kind !== "picture") note(sel, "ta", DEFAULT_OF.ta(el.ta) ? "default" : text?.align ? "field" : "nowhere", DEFAULT_OF.ta(el.ta) ? "" : text?.align ? `text.align ${el.ta}${kind === "button" ? "; the button sets its words where the node said" : ""}` : "not a value NodeText takes");
    if ("tt" in el && kind !== "picture") note(sel, "tt", DEFAULT_OF.tt(el.tt) ? "default" : text?.transform ? "field" : "nowhere", DEFAULT_OF.tt(el.tt) ? "" : text?.transform ? `text.transform ${el.tt}` : "not a value NodeText takes");

    /* Type. */
    let font = null;
    if (words) {
      font = fontOf(wordsEl, featureId);
      const drawsWeight = kind === "words" || kind === "button";
      const drawsLeading = kind !== "heading";
      note(sel, "fs", "field", `font.size ${font.size} × base ${BASE_PX}${PART_SCALE[featureId] !== 1 ? ` × the part's own ${PART_SCALE[featureId]}` : ""} = ${el.fs}px`);
      if ("fw" in el) note(sel, "fw", drawsWeight ? (font.weight > CLAMP.weight[1] ? "stored" : "field") : "stored", drawsWeight ? (font.weight > CLAMP.weight[1] ? `font.weight; the theme clamps it to ${CLAMP.weight[1]}` : `font.weight${kind === "button" ? ": the button's weight is the node's, else 700" : ""}`) : `font.weight; ${featureId} sets its own weight (700)`);
      if ("ff" in el) note(sel, "ff", "field", `font.${font.face ? `face "${font.face}"` : ""}${font.face && font.family ? " and " : ""}${font.family ? `family "${font.family}"` : ""}${font.face ? "; the face is carried in look.fonts when its file is" : `; "${el.ff}" is a generic keyword, the machine's own face, which cannot be carried`}`);
      if ("lh" in el) note(sel, "lh", drawsLeading ? "field" : "stored", drawsLeading ? `font.leading ${font.leading} (${el.lh}/${el.fs})` : `font.leading; ${featureId} sets its own line height (1.2)`);
      if ("ls" in el) note(sel, "ls", DEFAULT_OF.ls(el.ls) ? "default" : font.spacing !== undefined ? "field" : "nowhere", DEFAULT_OF.ls(el.ls) ? "" : font.spacing !== undefined ? `font.spacing ${font.spacing}em` : "under the 0.005em the reading keeps");
      if (!Object.keys(font).length) font = null;
    } else if (kind === "picture") {
      for (const p of TEXT_PROPS) if (p in el && p !== "color") note(sel, p, "n/a", "a text property on a picture");
    }

    /* Where it goes. */
    let link = null;
    if (el.href !== undefined) {
      const got = linkOf(el.href, cap.url);
      link = got.link;
      if (!link) note(sel, "href", "nowhere", got.how);
      else note(sel, "href", kind === "button" ? "field" : "stored", `${got.how}${kind === "button" ? "" : `; ${featureId} is not a linkable part, so the link is written but not pressed`}`);
    }
    /* A sidebar button: the page its section was captured as. On the box that is the button, not pressed by it — see the head of this file. */
    if (pageDef.route === "/" && el.t === "button" && within(el, "aside") && routes.sections[wordsWithin(el)]) {
      link = { kind: "page", target: routes.sections[wordsWithin(el)] };
      note(sel, "(sidebar)", "stored", `link (page ${link.target}): "${wordsWithin(el)}" leads to the page its section was captured as; the box does not press a link, so it is carried until the button ruling is settled`);
    }
    if (el.title) note(sel, "title", el.name ? "field" : "nowhere", el.name ? `the accessible name the tree computed from it ("${el.name}"): label and data, never words drawn in the box` : `"${el.title}" is shown on hover; the tree gave the element no name from it`);

    /* What it is: the role, its name, its states, and a field's type and placeholder. */
    const roleBits = [];
    if (el.role) {
      const drawnBy = { heading: "value-prop", paragraph: "prose", image: featureId, button: kind === "button" ? "cta-primary" : null }[el.role] ?? null;
      note(sel, "role", "field", drawnBy ? `${el.role}: the part (${drawnBy}) is chosen from it; written in label and prompt` : `${el.role}: no part in the library draws it, so the look is the shape's (${featureId}) and the role is written in label and prompt${["textbox", "button", "link"].includes(el.role) ? " and data" : ""}`);
      roleBits.push(el.role);
      if (el.name) { roleBits.push(`named “${el.name}”`); note(sel, "name", "field", `the accessible name: label${["textbox", "button", "link"].includes(el.role) ? " and data" : ""}${words && words === el.name ? " (the same as its words)" : ""}`); }
      if (el.state) { roleBits.push(...Object.entries(el.state).map(([k, v]) => (v === true ? k : `${k} ${v}`))); note(sel, "state", "field", `${Object.keys(el.state).join(", ")}: prompt${["textbox", "button", "link"].includes(el.role) ? " and data" : ""}`); }
    }
    if (el.type) { roleBits.push(`type ${el.type}`); note(sel, "type", "field", `a ${el.type} field: prompt and data`); }
    if (el.placeholder) { roleBits.push(`placeholder “${el.placeholder}”`); note(sel, "placeholder", "field", "prompt and data, as evidence of what the field is for; not words drawn in the box, which the page does not draw either"); }
    if (el.value) { roleBits.push(`value “${el.value}”`); note(sel, "value", "field", "prompt and data"); }
    if (el.aria) note(sel, "aria", el.name ? "folded" : "nowhere", el.name ? "the accessible name" : "");
    const roleLine = roleBits.join(", ");
    const roleSaid = el.role ? `The browser computes it as a ${roleLine}.` : "";

    /* The picture. */
    let picture = null;
    let data = "";
    let label;
    if (kind === "picture") {
      const got = pictureFor(el.src, cap.url);
      data = el.src;
      if (got) {
        picture = got.record;
        label = got.name.replace(/\.[^.]+$/, "") || "Picture";
        if (el.name) label = `image “${cut(el.name, 36)}”`;
        note(sel, "src", "field", `node.picture: a reference to ${got.record.path} (${got.bytes} bytes, ${got.size.w}×${got.size.h}), the bytes committed beside the document; the address itself is kept in data as words only`);
      } else {
        label = basename(new URL(el.src, cap.url).pathname);
        note(sel, "src", "nowhere", "the bytes were not supplied (--assets), so the address is kept in data as words only");
      }
      if ("maxw" in el) note(sel, "maxw", DEFAULT_OF.maxw(el.maxw) ? "default" : "nowhere", "");
    }

    /* The icon. */
    let vector = null;
    if (kind === "icon") {
      vector = vectorOf(el, strokes);
      note(sel, "vb", "field", `vector.viewBox; ${vector.paths.length} stroke${vector.paths.length === 1 ? "" : "s"} as vector.paths, drawn by drawn-icon${lineIcon ? " as outlines" : " as fills"}`);
    } else if (kind === "icon-blind") {
      if (el.vb) note(sel, "vb", "nowhere", "the strokes have no geometry to draw in it");
    }

    /* Geometry: exactly as captured. */
    for (const p of ["x", "y", "w", "h"]) note(sel, p, "field", p);

    /* What has no field on any part. */
    if (el.mar) note(sel, "mar", "nowhere", "a node has no margin field; the box already stands where the margin put it");
    if ("minh" in el && kind !== "page") note(sel, "minh", DEFAULT_OF.minh(el.minh) ? "default" : "nowhere", DEFAULT_OF.minh(el.minh) ? "" : "a node has a size, not a constraint on one");
    if ("maxw" in el && kind !== "picture") note(sel, "maxw", DEFAULT_OF.maxw(el.maxw) ? "default" : "nowhere", DEFAULT_OF.maxw(el.maxw) ? "" : "a node has a size, not a constraint on one");
    if (el.pos) {
      const relativeStill = el.pos === "relative" && (el.ins ?? []).every((v) => v === "0px" || v === "auto");
      if (relativeStill) {
        note(sel, "pos", "default", "relative with no offset");
        if (el.ins) note(sel, "ins", "default", "");
        if ("z" in el) note(sel, "z", DEFAULT_OF.z(el.z) ? "default" : "nowhere", DEFAULT_OF.z(el.z) ? "" : "stacking is the order of the nodes array, never a number");
      } else {
        note(sel, "pos", "field", `${el.pos}: the box stays where it was measured, and the band is written after the parts that flow, so it paints over them as the browser did${el.pos === "absolute" || el.pos === "fixed" ? "; kept as from.position, out of the flow" : ""}`);
        if (el.ins) note(sel, "ins", "nowhere", "the inset that placed it; its box already carries the result");
        if ("z" in el) note(sel, "z", DEFAULT_OF.z(el.z) ? "default" : "field", DEFAULT_OF.z(el.z) ? "" : "the order of the positioned bands in the nodes array; the number itself is not kept");
      }
    }

    /* Its name on the board: what it is, then what it says or holds. */
    const said = el.role ? `${el.role}${el.name ? ` “${cut(el.name, 36)}”` : ""}` : null;
    if (kind === "icon" || kind === "icon-blind") {
      const kinds = [...new Set(strokes.map((s) => s.t))];
      label = `${said ?? "icon"} · ${strokes.length} stroke${strokes.length === 1 ? "" : "s"}`;
      data = kind === "icon"
        ? `${strokes.length} stroke${strokes.length === 1 ? "" : "s"} (${kinds.join(", ")})${inks.length ? ` in ${inks.join(", ")}` : ""}`
        : `${strokes.length} stroke${strokes.length === 1 ? "" : "s"} (${kinds.join(", ")})${inks.length ? ` in ${inks.join(", ")}` : ""}; the path geometry was not captured`;
    } else if (kind === "picture") {
      /* named above */
    } else if (said && el.name && el.name === words) {
      label = said;
    } else if (said) {
      label = words ? `${said}: ${cut(words, 36)}` : `${said} · ${el.kids.length} inside`;
    } else if (words) {
      label = cut(words, 36);
    } else {
      label = `${el.t} · ${el.kids.length} inside`;
    }
    /* The interactive roles say what they are where the backend list is written. */
    if (["textbox", "button", "link"].includes(el.role)) data = [data, roleLine].filter(Boolean).join("; ");

    /* Options a real part reads. */
    const options = {};
    if (kind === "button") {
      // No radius was captured on any element, and the capture leaves a zero property out (as it does bg and pad), so every corner is square.
      options.shape = "square";
      // A fill the node named is painted by Fill and the part paints nothing over it; with no fill, outline is the one variant that paints nothing of its own, and the edge of none keeps it edgeless.
      options.variant = colour.bg ? "solid" : "outline";
      if (el.bg && !colour.bg) note(sel, "bg", "nowhere", `the fill could not be carried, so the variant is outline rather than a solid accent the page never had`);
      options.size = "medium";
    }
    if (kind === "heading") options.turn = "none";
    if (kind === "icon") {
      // DrawnIcon (parts/DrawnIcon.tsx): "drawn as" line or solid, "paths" how many it keeps before merging, "size" the share of the box the icon fills — 100 so it stands at the size it was measured.
      options["drawn as"] = lineIcon ? "line" : "solid";
      options.paths = String(Math.min(ICON_PATHS_MAX, Math.max(1, vector.paths.length)));
      options.size = "100";
    }

    made.push({
      el,
      band: bandOf(el),
      node: {
        id: "",
        pageId: PAGE_ID,
        featureId,
        label,
        prompt: `Captured from ${host}${url.pathname}${cap.section ? ` (${cap.section})` : ""} as ${sel}. The box, the words, the colours and the type are the ones measured on the page.${roleSaid ? ` ${roleSaid}` : ""}`,
        content,
        data,
        x: el.x, y: el.y, w: el.w, h: el.h,
        groupId: null,
        options,
        priority: "must",
        custom: false,
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
        shape: null,
        outline: null,
        kind: null,
        vector,
        role: vector ? "icon" : null,
        cube: null,
        mesh: null,
        code: null,
        aura: null,
        auraSize: 1,
        auraStyle: "glow",
        texture: null,
        ...(picture ? { picture } : {}),
        sketch: null,
        /* Out of the flow, as the capture measured it: an absolute or fixed element
           sizes nothing that holds it (his SOL WORKS badge overhangs its header on
           purpose), so a wrapper is never grown to take it in. */
        from: { url: cap.url, host, selector: sel, at, ...(el.pos === "absolute" || el.pos === "fixed" ? { position: el.pos } : {}) },
        ...(layout ? { layout } : {}),
        ...(pad ? { pad } : {}),
        ...(edge ? { edge } : {}),
        ...(text ? { text } : {}),
      },
    });
  }

  /* The stack: what flows first, then each positioned band, lowest z-index first. */
  const bands = [...new Set(made.map((m) => m.band).filter(Boolean))];
  const bandRank = new Map(bands.sort((a, b) => zOf(a) - zOf(b) || a.order - b.order).map((b, i) => [b, i + 1]));
  made.sort((a, b) => (a.band ? bandRank.get(a.band) : 0) - (b.band ? bandRank.get(b.band) : 0) || a.el.order - b.el.order);

  /* Overlaps in the measured geometry: kept; the paint order settles which shows. */
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

  const byKind = {};
  for (const el of all) byKind[el.kind] = (byKind[el.kind] ?? 0) + 1;
  return { made, bands, overlaps, byKind, elements: all.length, page };
}

/* ------------------------------------------------------------------ */
/* Every page                                                           */
/* ------------------------------------------------------------------ */

note("(routes)", "pages", "field", `${routes.pages.length} pages, read from the site's source (routes.json)`);
const converted = [];
const facesRead = { faces: [], links: [] };
let first = null;
for (const p of routes.pages) {
  const file = join(routesDir, "routes", `${p.id}.json`);
  if (!existsSync(file)) { console.error(`${p.id}: no capture at ${file}`); process.exit(1); }
  const cap = JSON.parse(readFileSync(file, "utf8"));
  first ??= cap;
  for (const f of cap.faces?.faces ?? []) if (!facesRead.faces.some((g) => JSON.stringify(g) === JSON.stringify(f))) facesRead.faces.push(f);
  for (const l of cap.faces?.links ?? []) if (!facesRead.links.some((g) => g.href === l.href)) facesRead.links.push(l);
  converted.push({ def: p, cap, ...convert(p, cap) });
}
notePage = "";

let n = 0;
const nodes = converted.flatMap((c) => c.made.map((m) => ({ ...m.node, id: `n_${m.node.featureId.replace(/-/g, "")}_${++n}` })));

/* ------------------------------------------------------------------ */
/* The faces (fonts.ts#carryFaces, transcribed)                         */
/* ------------------------------------------------------------------ */

const FORBIDS = [
  { host: /(^|\.)typekit\.(net|com)$/i, says: "Adobe Fonts' licence forbids carrying the file; its stylesheet link is kept, and the face loads from Adobe only where Adobe allows the site to" },
  { host: /(^|\.)fonts\.adobe\.com$/i, says: "Adobe Fonts' licence forbids carrying the file; its stylesheet link is kept, and the face loads from Adobe only where Adobe allows the site to" },
  { host: /(^|\.)typography\.com$/i, says: "Cloud.typography's licence forbids carrying the file; its stylesheet link is kept, and the face loads only where the licence allows" },
  { host: /(^|\.)fonts\.com$/i, says: "Monotype's licence forbids carrying the file; its stylesheet link is kept, and the face loads only where the licence allows" },
  { host: /(^|\.)myfonts\.net$/i, says: "MyFonts' licence forbids carrying the file; its stylesheet link is kept, and the face loads only where the licence allows" },
];
const OPEN = /(^|\.)(fonts\.gstatic\.com|fonts\.googleapis\.com|fonts\.bunny\.net|cdn\.jsdelivr\.net|unpkg\.com|fontlibrary\.org)$/i;
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
const forbids = (u) => FORBIDS.find((f) => f.host.test(hostOf(u)))?.says ?? null;
const licenceOf = (u) => (OPEN.test(hostOf(u)) ? "an open face (OFL or Apache), carried with the page" : "the page's own file, carried as the page serves it; its licence is the page's");
function isLatin(range) {
  if (!range || !range.trim()) return true;
  return range.split(",").some((part) => {
    const m = /u\+([0-9a-f?]+)/i.exec(part.trim());
    if (!m) return false;
    const start = parseInt(m[1].replace(/\?/g, "0"), 16);
    return Number.isFinite(start) && start <= 0x7a;
  });
}
const FORMAT_OF = [[/\.woff2(\?|#|$)/i, "woff2"], [/\.woff(\?|#|$)/i, "woff"], [/\.ttf(\?|#|$)/i, "truetype"], [/\.otf(\?|#|$)/i, "opentype"]];
function formatOf(s) {
  const f = (s.format ?? "").toLowerCase().replace(/["']/g, "");
  if (f) return /^(woff2|woff|truetype|opentype)$/.test(f) ? f : f === "ttf" ? "truetype" : f === "otf" ? "opentype" : null;
  return FORMAT_OF.find(([re]) => re.test(s.url))?.[1] ?? null;
}
const MIME = { woff2: "font/woff2", woff: "font/woff", truetype: "font/ttf", opentype: "font/otf" };
const fontId = (family, weight, style) => `font:${family.toLowerCase().replace(/\s+/g, "-")}:${(weight ?? "400").replace(/\s+/g, "-")}:${style ?? "normal"}`;
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** The fetcher: the file the capture saved under --assets, by name. */
function fetchBytes(u) {
  const file = assetsDir ? join(assetsDir, basename(new URL(u).pathname)) : null;
  if (!file || !existsSync(file)) return { error: assetsDir ? "the file was not saved beside the captures" : "no --assets folder to read it from" };
  return { bytes: readFileSync(file) };
}
function carryFaces(read, used, pageUrl) {
  const fonts = [];
  const named = [];
  let weight = 0;
  const seen = new Set();
  for (const name of used) {
    const family = (name ?? "").trim();
    if (!family || seen.has(family.toLowerCase())) continue;
    seen.add(family.toLowerCase());
    const rules = read.faces.filter((f) => same(f.family, family) && isLatin(f.unicodeRange)).slice(0, FONT_RULES_MAX);
    if (!rules.length) {
      const link = read.links.find((l) => new RegExp(`family=${family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "(\\+|%20|\\s)")}`, "i").test(l.href));
      if (link) fonts.push({ id: fontId(family), family, source: { kind: "link", href: link.href }, from: { url: pageUrl, sheet: link.href }, licence: licenceOf(link.href), carried: true });
      else named.push(family);
      continue;
    }
    for (const rule of rules) {
      const id = fontId(family, rule.weight, rule.style);
      if (fonts.some((f) => f.id === id)) continue;
      const src = rule.sources.map((s) => ({ ...s, format: formatOf(s) })).find((s) => s.format);
      const base = { id, family, ...(rule.weight ? { weight: rule.weight } : {}), ...(rule.style ? { style: rule.style } : {}), from: { url: pageUrl, sheet: rule.sheet } };
      if (!src) { fonts.push({ ...base, source: { kind: "url", url: rule.sources[0]?.url ?? "" }, licence: "no source in a format a browser draws", carried: false, says: `${family} is declared in a format no browser here draws` }); continue; }
      const no = forbids(src.url);
      if (no) { fonts.push({ ...base, source: rule.sheet ? { kind: "link", href: rule.sheet } : { kind: "url", url: src.url, format: src.format }, licence: no, carried: false, says: `${family} could not be carried: ${no}` }); continue; }
      const got = fetchBytes(src.url);
      if (got.error !== undefined) { fonts.push({ ...base, source: { kind: "url", url: src.url, format: src.format }, licence: licenceOf(src.url), carried: false, says: `${family} could not be fetched from ${src.url}: ${got.error}` }); continue; }
      const size = got.bytes.length;
      if (size > FONT_FILE_MAX || weight + size > FONT_TOTAL_MAX) { fonts.push({ ...base, source: { kind: "url", url: src.url, format: src.format }, licence: licenceOf(src.url), carried: false, says: `${family} could not be carried: its file is ${Math.round(size / 1024)}KB, past the ${Math.round(FONT_FILE_MAX / 1024)}KB a face may weigh` }); continue; }
      weight += size;
      fonts.push({ ...base, source: { kind: "data", src: `data:${MIME[src.format] ?? "font/woff2"};base64,${Buffer.from(got.bytes).toString("base64")}`, format: src.format }, licence: licenceOf(src.url), carried: true, bytes: size });
    }
  }
  return { fonts, named };
}
const used = [...new Set(nodes.map((nd) => nd.font?.face).filter(Boolean))];
const generics = [...new Set(converted.flatMap((c) => c.made.map((m) => m.el.ff)).filter((f) => f && GENERIC.test(f)))];
const carried = carryFaces(facesRead, used, routes.site);
const declared = [...new Set(facesRead.faces.map((f) => f.family))];
for (const f of carried.fonts) note("(faces)", f.family, f.carried ? "field" : "stored", f.carried ? `look.fonts: ${f.id}, ${Math.round((f.bytes ?? 0) / 1024)}KB as ${f.source.kind}; ${f.licence}` : `look.fonts, by address: ${f.says}`);
for (const f of carried.named) note("(faces)", f, "nowhere", "a system face: no rule declares it, so it is named and needs no file");
for (const f of declared) if (!used.some((u) => same(u, f))) note("(faces)", f, "default", "declared by the page but no captured element is set in it, so it is not carried");
for (const g of generics) note("(faces)", g, "nowhere", `a generic keyword: the machine's own face, a different face on a different machine, and it cannot be carried — every box set in it was measured in this machine's`);

/* ------------------------------------------------------------------ */
/* The document                                                         */
/* ------------------------------------------------------------------ */

note("(capture)", "url", "field", "from.url on every part; pages[].path from routes.json");
note("(capture)", "title", "field", "brief.name");
note("(capture)", "capturedAt", "field", "from.at on every part");
note("(capture)", "viewport[0]", "field", "frameWidth");
note("(capture)", "viewport[1]", "nowhere", "the frame has no viewport height");
note("(capture)", "page[1]", "nowhere", "the frame's height is derived from the lowest part");
note("(capture)", "bodyBg", "field", "look.palette.bg; palette.mode from its lightness");
note("(capture)", "bodyColor", "field", "look.palette.text");
note("(capture)", "font", "field", `type.bodyFamily and type.headingFamily as the class "${familyOf(first.font)}"; the stack itself has no field`);
note("(capture)", "wallet", first.wallet ? "nowhere" : "default", first.wallet ? "a stand-in wallet was connected so the sidebar and its sections would render; the address on the wallet button is the stand-in's, not his" : "");

const doc = {
  pages: routes.pages.map((p) => ({ id: p.id, name: p.name, path: p.path, prompt: p.click ? `The ${p.name} section of ${p.route} on ${site.host}, reached by pressing "${p.click}" in the sidebar; on the live site it is a state of that page, not a route.` : p.note ?? "", scroll: "inherit" })),
  nodes,
  groups: [],
  shapes: [],
  format: {
    "type.headingFamily": familyOf(first.font) ?? "geometric sans",
    "type.bodyFamily": familyOf(first.font) ?? "system sans",
    "type.baseSize": BASE_PX,
    "layout.radius": 0,
    "palette.mode": light(first.bodyBg) < 0.5 ? "dark" : "light",
  },
  brief: { name: first.title, gimmick: "", master: "" },
  look: {
    palette: { bg: first.bodyBg, text: first.bodyColor },
    texture: [],
    target: "page",
    light: DEFAULT_LIGHT,
    ...(carried.fonts.length ? { fonts: carried.fonts } : {}),
  },
  motion: [],
  activePageId: routes.pages[0].id,
  hiddenFeatures: [],
  frameWidth: first.viewport[0],
  companion: null,
};

mkdirSync(join(outDir, "site"), { recursive: true });
writeFileSync(join(outDir, "site", "document.json"), JSON.stringify(doc, null, 2) + "\n");

/* ------------------------------------------------------------------ */
/* The ledger, said plainly                                             */
/* ------------------------------------------------------------------ */

const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); return { ...m, [k]: (m[k] ?? 0) + 1 }; }, {});
console.log(`${converted.reduce((s, c) => s + c.elements, 0)} captured elements on ${converted.length} pages → ${nodes.length} parts, ${doc.groups.length} groups, ${pictures.size} pictures${pictures.size ? ` (${[...pictures.values()].map((p) => p.record.path).join(", ")})` : ""}, ${carried.fonts.filter((f) => f.carried).length} faces carried`);
for (const c of converted) {
  console.log(`\n${c.def.id} (${c.def.name}, ${c.def.path}${c.cap.reached ? `, after pressing "${c.cap.reached.click}"` : ""}): ${c.elements} elements → ${c.made.length} parts`);
  console.log("  elements by kind:", JSON.stringify(c.byKind));
  console.log("  parts by feature:", JSON.stringify(count(c.made, (m) => m.node.featureId)));
  console.log("  parts carrying a box field:", JSON.stringify({ layout: c.made.filter((m) => m.node.layout).length, pad: c.made.filter((m) => m.node.pad).length, edge: c.made.filter((m) => m.node.edge).length, text: c.made.filter((m) => m.node.text).length }));
  console.log(`  links: ${JSON.stringify(count(c.made.filter((m) => m.node.link), (m) => `${m.node.link.kind}:${m.node.link.target}`))}`);
  console.log(`  roles: ${JSON.stringify(count(c.made.filter((m) => m.el.role), (m) => m.el.role))}; ${c.made.filter((m) => !m.el.role).length} with none`);
  console.log(`  paint order: ${c.made.filter((m) => !m.band).length} parts that flow, then ${c.bands.length} positioned band${c.bands.length === 1 ? "" : "s"}: ${c.bands.map((b) => `${b.t} (${b.pos}, z ${b.z ?? "auto"}, ${c.made.filter((m) => m.band === b).length} parts)`).join(", ")}`);
  console.log(`  overlaps in the measured geometry: ${c.overlaps.length} — ${c.overlaps.filter((o) => o.positioned).length} a positioned band over what flows beneath it, ${c.overlaps.filter((o) => o.kin).length} a child poking out of its own parent`);
}
console.log(`\nfaces: ${carried.fonts.map((f) => `${f.family} ${f.weight ?? ""} ${f.carried ? `carried (${Math.round((f.bytes ?? 0) / 1024)}KB)` : `not carried: ${f.says}`}`).join("; ") || "none carried"}${carried.named.length ? `; system faces: ${carried.named.join(", ")}` : ""}${generics.length ? `; generic keywords, the machine's own face: ${generics.join(", ")}` : ""}`);

const props = new Map();
for (const l of ledger) {
  const p = props.get(l.prop) ?? { total: 0, to: {}, how: new Map() };
  p.total++;
  p.to[l.to] = (p.to[l.to] ?? 0) + 1;
  if (l.how) p.how.set(`${l.to}: ${l.how}`, (p.how.get(`${l.to}: ${l.how}`) ?? 0) + 1);
  props.set(l.prop, p);
}
console.log("\nWHERE EACH CAPTURED PROPERTY WENT (all pages)");
for (const [prop, p] of [...props.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`\n${prop}  (${p.total}): ${Object.entries(p.to).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  for (const [how, k] of [...p.how.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${k}× ${how}`);
}
writeFileSync(join(outDir, "ledger.json"), JSON.stringify(ledger, null, 1));

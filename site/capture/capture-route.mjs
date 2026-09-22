#!/usr/bin/env node
/**
 * A mechanical dump of one live page, or one state of it.
 *
 * The same shape as `ccc-capture.json`, the dump his page was first taken
 * as: a tree from `body` down, every visible element with its real box,
 * its own words and its computed styles, as the browser reports them.
 * Nothing is inferred. Three things are recorded that the first dump did
 * not have, each a fact of the page and not a reading of it:
 *
 *   faces   the page's `@font-face` rules, read off its stylesheets the
 *           way polio's `siteRead.ts#FACES` reads them, so a face can be
 *           carried one to one instead of named and substituted
 *   d       the geometry of an icon's strokes (a `path`'s own `d`; a
 *           circle, rect, line, polyline, polygon or ellipse written as the
 *           path that draws the same shape), with `fill`, `stroke` and
 *           `sw` as computed, and `vb`, the svg's viewBox
 *   title   a button's or a link's `title` attribute — the words the page
 *           shows for it on hover, when it shows none in the box
 *
 * WHY A WALLET STANDS IN. The sidebar, and every section it leads to, is
 * rendered only when a wallet is connected (`app/page.tsx`: `connected &&
 * <Sidebar/>`). A headless browser has no wallet, so `--wallet` installs a
 * stand-in Phantom provider before the page's scripts run: it answers
 * `connect()` with a fixed public key and signs nothing. The page then
 * shows what it shows any wallet that holds nothing. The key is not his;
 * the address on the wallet button is the stand-in's, and the ledger says
 * so.
 *
 *   node capture-route.mjs <url> <out.json> [--wallet] [--agree]
 *        [--click "<words>" [--within <selector>]] [--width 1763 --height 1427]
 *        [--assets <dir>] [--section <id>]
 *
 * `--click` presses the button holding exactly those words (inside
 * `--within`, when given) and waits for the page to settle, which is how a
 * section of a one-page app is reached. `--assets` downloads every picture
 * the page shows and every font file its faces name into that folder, by
 * file name, for the converter to carry.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node22/lib/node_modules/playwright", "/usr/lib/node_modules/playwright"].filter(Boolean)) {
    try { return req(c); } catch { /* next */ }
  }
  throw new Error("No Playwright found.");
})();

/* ------------------------------------------------------------------ */
/* Arguments                                                            */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, d = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const url = args[0];
const out = args[1];
if (!url || !out || url.startsWith("--")) {
  console.error('usage: node capture-route.mjs <url> <out.json> [--wallet] [--agree] [--click "<words>"] [--within <sel>] [--assets <dir>] [--section <id>]');
  process.exit(2);
}
const width = Number(opt("--width", 1763));
const height = Number(opt("--height", 1427));
const assets = opt("--assets");
const click = opt("--click");
const within = opt("--within", "body");
const section = opt("--section");

/* ------------------------------------------------------------------ */
/* The stand-in wallet                                                  */
/* ------------------------------------------------------------------ */

/**
 * What `PhantomWalletAdapter` (@solana/wallet-adapter-phantom) asks of the
 * provider it finds at `window.phantom.solana`: `isPhantom`, `connect()`,
 * a `publicKey` with `toBytes()`, and `on()` for disconnect and
 * accountChanged. `walletName` in localStorage is what `autoConnect`
 * reads to pick it without the modal. The key bytes are fixed so every
 * capture shows the same address.
 */
const WALLET = `(() => {
  const bytes = new Uint8Array(32); for (let i = 0; i < 32; i++) bytes[i] = (i * 37 + 11) % 251;
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const b58 = (u8) => { const d = [0]; for (const b of u8) { let c = b; for (let j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } } let s = ""; for (const b of u8) { if (b) break; s += "1"; } for (let j = d.length - 1; j >= 0; j--) s += ALPHABET[d[j]]; return s; };
  const publicKey = { toBytes: () => bytes, toBuffer: () => bytes, toBase58: () => b58(bytes), toString: () => b58(bytes), equals: (o) => o && o.toString() === b58(bytes) };
  const listeners = {};
  const wallet = {
    isPhantom: true, isConnected: false, publicKey: null,
    connect: async () => { wallet.isConnected = true; wallet.publicKey = publicKey; (listeners.connect || []).forEach((f) => f(publicKey)); return { publicKey }; },
    disconnect: async () => { wallet.isConnected = false; wallet.publicKey = null; (listeners.disconnect || []).forEach((f) => f()); },
    on: (e, f) => { (listeners[e] = listeners[e] || []).push(f); }, off: (e, f) => { listeners[e] = (listeners[e] || []).filter((g) => g !== f); },
    removeListener: (e, f) => { listeners[e] = (listeners[e] || []).filter((g) => g !== f); },
    signTransaction: async () => { throw new Error("stand-in wallet signs nothing"); },
    signAllTransactions: async () => { throw new Error("stand-in wallet signs nothing"); },
    signMessage: async () => { throw new Error("stand-in wallet signs nothing"); },
    request: async () => { throw new Error("stand-in wallet answers nothing"); },
  };
  window.phantom = { solana: wallet }; window.solana = wallet;
  try { localStorage.setItem("walletName", JSON.stringify("Phantom")); } catch {}
})();`;

/* ------------------------------------------------------------------ */
/* The dump, run inside the page                                        */
/* ------------------------------------------------------------------ */

/** Runs in the browser. Returns the capture as `ccc-capture.json` had it, plus faces, `d`, `vb` and `title`. */
const DUMP = () => {
  const SKIP = new Set(["script", "style", "noscript", "template", "link", "meta", "head", "title", "iframe"]);
  const SHAPES = new Set(["path", "polyline", "polygon", "line", "circle", "ellipse", "rect"]);
  const num = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
  const round = (n) => Math.round(n);
  const own = (el) => Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
  const family = (ff) => (ff.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
  const zeroes = (a) => a.every((v) => !v);
  /** A stroke's shape as the path that draws it: mechanical, so an icon keeps its lines. */
  const pathOf = (el) => {
    const a = (n) => num(el.getAttribute(n)) ?? 0;
    switch (el.tagName.toLowerCase()) {
      case "path": return el.getAttribute("d") ?? null;
      case "line": return `M${a("x1")} ${a("y1")}L${a("x2")} ${a("y2")}`;
      case "polyline": case "polygon": {
        const pts = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
        if (pts.length < 4) return null;
        let d = `M${pts[0]} ${pts[1]}`;
        for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
        return el.tagName.toLowerCase() === "polygon" ? `${d}Z` : d;
      }
      case "circle": { const cx = a("cx"), cy = a("cy"), r = a("r"); return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`; }
      case "ellipse": { const cx = a("cx"), cy = a("cy"), rx = a("rx"), ry = a("ry"); return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`; }
      case "rect": { const x = a("x"), y = a("y"), w = a("width"), h = a("height"); return `M${x} ${y}h${w}v${h}h${-w}Z`; }
      default: return null;
    }
  };
  const walk = (el) => {
    const t = el.tagName.toLowerCase();
    if (SKIP.has(t)) return null;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    const e = { t, x: round(r.left + scrollX), y: round(r.top + scrollY), w: round(r.width), h: round(r.height) };
    const text = own(el);
    if (text) e.text = text;
    const bg = cs.backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") e.bg = bg;
    const kids = [];
    for (const k of Array.from(el.children)) { const got = walk(k); if (got) kids.push(got); }
    const leaf = !Array.from(el.children).length;
    if (text || leaf) {
      e.color = cs.color;
      const fs = num(cs.fontSize); if (fs !== null) e.fs = fs;
      e.fw = cs.fontWeight;
      e.ff = family(cs.fontFamily);
      const lh = num(cs.lineHeight); if (lh !== null) e.lh = lh;
      e.ls = cs.letterSpacing;
      e.ta = cs.textAlign;
      e.tt = cs.textTransform;
    }
    if (cs.display === "flex" || cs.display === "grid" || cs.display === "inline-flex" || cs.display === "inline-grid") {
      e.disp = cs.display.replace("inline-", "");
      e.dir = cs.flexDirection;
      e.gap = cs.gap;
      e.just = cs.justifyContent;
      e.align = cs.alignItems;
      e.wrap = cs.flexWrap;
      if (e.disp === "grid") e.cols = cs.gridTemplateColumns;
    }
    if (cs.minHeight !== "0px") e.minh = cs.minHeight;
    if (cs.maxWidth !== "none") e.maxw = cs.maxWidth;
    const mar = [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].map((v) => round(num(v) ?? 0));
    if (!zeroes(mar)) e.mar = mar;
    const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => round(num(v) ?? 0));
    if (!zeroes(pad)) e.pad = pad;
    if ((num(cs.borderTopWidth) ?? 0) > 0 && cs.borderTopStyle !== "none") {
      e.border = cs.border && cs.border.trim() ? cs.border : `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`;
    }
    if (cs.position !== "static") {
      e.pos = cs.position;
      e.ins = [cs.top, cs.right, cs.bottom, cs.left];
      e.z = cs.zIndex;
    }
    if (t === "img") e.src = el.currentSrc || el.src;
    if (t === "a" && el.getAttribute("href") !== null) e.href = el.getAttribute("href");
    const title = el.getAttribute("title") || el.getAttribute("aria-label");
    if (title && (t === "a" || t === "button")) e.title = title.trim();
    if (t === "svg" && el.getAttribute("viewBox")) e.vb = el.getAttribute("viewBox");
    if (SHAPES.has(t)) {
      const d = pathOf(el); if (d) e.d = d;
      /* How the stroke is drawn: an outline in its stroke colour, or a filled shape. */
      e.fill = cs.fill; e.stroke = cs.stroke; const sw = num(cs.strokeWidth); if (sw !== null) e.sw = sw;
    }
    if (kids.length) e.kids = kids;
    return e;
  };
  /* The page's `@font-face` rules, as siteRead.ts#FACES reads them. */
  const faces = [];
  const links = [];
  const abs = (u, base) => { try { return new URL(u, base).href; } catch { return u; } };
  const rules = (list, base, sheet) => {
    for (const r of Array.from(list)) {
      if (r instanceof CSSFontFaceRule) {
        const st = r.style;
        const fam = st.getPropertyValue("font-family").trim().replace(/^["']|["']$/g, "");
        const src = st.getPropertyValue("src");
        const sources = [];
        const re = /url\((["']?)([^)"']+)\1\)(?:\s*format\((["']?)([^)"']+)\3\))?/g;
        let m;
        while ((m = re.exec(src))) sources.push({ url: abs(m[2], base), ...(m[4] ? { format: m[4] } : {}) });
        if (fam && sources.length) {
          const weight = st.getPropertyValue("font-weight").trim();
          const style = st.getPropertyValue("font-style").trim();
          const range = st.getPropertyValue("unicode-range").trim();
          faces.push({ family: fam, ...(weight ? { weight } : {}), ...(style ? { style } : {}), sources, sheet, ...(range ? { unicodeRange: range } : {}) });
        }
      } else if (r instanceof CSSImportRule) {
        try { const inner = r.styleSheet; if (inner) rules(inner.cssRules, inner.href ?? base, inner.href ?? sheet); } catch { if (r.href) links.push({ href: abs(r.href, base) }); }
      } else if (r.cssRules) rules(r.cssRules, base, sheet);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    let list = null;
    try { list = sheet.cssRules; } catch { if (sheet.href) links.push({ href: sheet.href }); continue; }
    if (list) rules(list, sheet.href ?? location.href, sheet.href ?? null);
  }
  const body = getComputedStyle(document.body);
  return {
    url: location.href,
    title: document.title,
    capturedAt: new Date().toISOString(),
    viewport: [innerWidth, innerHeight],
    page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    bodyBg: body.backgroundColor,
    bodyColor: body.color,
    font: body.fontFamily,
    faces: { faces, links },
    tree: walk(document.body),
  };
};

/* ------------------------------------------------------------------ */
/* Drive the page                                                       */
/* ------------------------------------------------------------------ */

/* The full browser, not the headless shell: only the full one reads the machine's own certificate store, and the page is fetched through a proxy that re-terminates TLS. */
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  headless: true,
  /* Playwright does not read HTTPS_PROXY; the browser is told the same proxy every other tool here goes out through. */
  ...(proxy ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } } : {}),
});
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
if (flag("--wallet")) await context.addInitScript(WALLET);
const page = await context.newPage();
const settle = async (ms = 1200) => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(ms); };
await page.goto(url, { waitUntil: "load" });
await settle();

/* The disclaimer stands over everything until it is agreed to; the first capture was taken after it. */
if (flag("--agree")) {
  const agree = page.getByRole("button", { name: "AGREE AND CLOSE" });
  if (await agree.count()) { await agree.first().click(); await settle(400); }
}
/* The wallet modal opens itself half a second after load when nothing is connected; with the stand-in it should not, and if it did it is closed. */
if (flag("--wallet")) {
  for (let i = 0; i < 20; i++) {
    const modal = page.locator(".wallet-adapter-modal-wrapper, .wallet-adapter-modal");
    if (await modal.count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
    if (await page.locator("aside").count()) break;
    await page.waitForTimeout(500);
  }
  /* "Processing items..." holds the sidebar back for three seconds after connecting. */
  await page.waitForSelector("aside", { timeout: 15000 }).catch(() => {});
  await settle(500);
}
if (click) {
  const target = page.locator(within).getByRole("button", { name: click, exact: true });
  if (!(await target.count())) { console.error(`no button reading "${click}" inside ${within}`); await browser.close(); process.exit(1); }
  await target.first().click();
  /* A section not yet opened shows "Processing items..." for a second before it lands. */
  await page.waitForTimeout(1500);
  await settle(800);
}
await page.evaluate(() => scrollTo(0, 0));
await page.waitForTimeout(200);

const cap = await page.evaluate(DUMP);
if (section) cap.section = section;
if (click) cap.reached = { click, within };
if (flag("--wallet")) cap.wallet = "stand-in";

/* The bytes: pictures the page shows and the font files its faces name, by file name. */
if (assets) {
  mkdirSync(assets, { recursive: true });
  const srcs = new Set();
  (function walk(e) { if (e.src) srcs.add(e.src); (e.kids ?? []).forEach(walk); })(cap.tree);
  for (const f of cap.faces.faces) for (const s of f.sources) if (/^https?:/.test(s.url)) srcs.add(s.url);
  for (const src of srcs) {
    const name = basename(new URL(src).pathname);
    const file = join(assets, name);
    if (existsSync(file)) continue;
    const res = await context.request.get(src).catch(() => null);
    if (!res || !res.ok()) { console.error(`could not fetch ${src}`); continue; }
    writeFileSync(file, await res.body());
  }
}

await browser.close();
mkdirSync(join(out, ".."), { recursive: true });
writeFileSync(out, JSON.stringify(cap));
let n = 0; (function count(e) { n++; (e.kids ?? []).forEach(count); })(cap.tree);
console.log(`${out}: ${n} elements, page ${cap.page[0]}×${cap.page[1]}, ${cap.faces.faces.length} face rules${click ? `, after pressing "${click}"` : ""}`);

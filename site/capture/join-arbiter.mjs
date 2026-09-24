/**
 * THE RECORDED BOX ARBITRATES THE JOINED WORDS.
 *
 * The capture reads an element's words with `own()` (capture-route.mjs),
 * which joins its text nodes with a space and trims the ends. Both are
 * wrong where the page did otherwise, and in opposite directions:
 *
 *   - React draws "$" and "116.59" as two text nodes with nothing between
 *     them; the join makes "$ 116.59". The page drew "$116.59".
 *   - "A Sol", "Works", " project" are three spans; the trim takes the space
 *     off " project", and nothing puts it back. The page drew "A SolWorks
 *     project".
 *
 * The words are joined, but the BOX was measured off the page as it was
 * laid out, so the box can say which. Measured in the capture machine's
 * fonts, over all nine pages of 5a0bc6d: every one-line part whose words
 * come out wider than its box by about one space is a price with an
 * inserted space (16 parts), and every run whose box is its words plus
 * exactly one space is a wordmark "project" missing its leading one (17).
 * Parts over by less than half a space are rounding and are left alone;
 * blocks wider than their words by many spaces cannot testify and are not
 * asked.
 *
 * WHAT IT WILL NOT DO: guess. A text with more than one space may be told a
 * space is extra, but not which, so it is left as captured and noted. A run
 * with a touching neighbour on both sides may be told a space is missing,
 * but not on which side, so it too is left and noted.
 *
 * THE METRICS ARE THE MACHINE'S. The widths are measured in a browser on
 * the machine running this, in the faces the capture carried and otherwise
 * the stack the part names. They only arbitrate if that machine sets type
 * the way the capture machine did; `probe` is written to the ledger so the
 * run says which metrics it used and how they compared with the capture.
 */
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
export function loadChromium() {
  for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node22/lib/node_modules/playwright", "/usr/lib/node_modules/playwright", "playwright-core"].filter(Boolean)) {
    try { return req(c).chromium; } catch { /* next */ }
  }
  return null;
}

/** The stacks a part's family names, as the Builder draws them (parts/theme.ts#FAMILY). */
const STACKS = {
  monospace: "ui-monospace, 'SF Mono', Menlo, monospace",
  serif: "Georgia, 'Times New Roman', serif",
};
const TEXT_KINDS = new Set(["prose", "value-prop"]);

/** How far over or under, in spaces, a join has to be before the box is believed. */
export const BAND = { overMin: 0.5, overMax: 1.5, underTol: 0.25 };

/**
 * Every text part's words measured against its box. `fonts` are the carried
 * faces (look.fonts); `base` the type's base size in px.
 */
export async function measureParts(nodes, fonts, base) {
  const chromium = loadChromium();
  if (!chromium) return null;
  const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
  try {
    const page = await browser.newPage();
    await page.setContent("<html><body></body></html>");
    const faces = (fonts ?? []).filter((f) => f.source?.kind === "data").map((f) => `@font-face{font-family:"${f.family}";src:url(${f.source.src});font-weight:${f.weight ?? 400};font-style:${f.style ?? "normal"}}`).join("\n");
    if (faces) await page.addStyleTag({ content: faces });
    const jobs = nodes
      .filter((n) => TEXT_KINDS.has(n.featureId) && typeof n.content === "string" && n.content.trim() && !n.content.includes("\n") && n.font)
      .map((n) => {
        const f = n.font;
        const stack = STACKS[f.family] ?? (f.family ? `${f.family}, sans-serif` : STACKS.monospace);
        const family = f.face ? `"${f.face}", ${stack}` : stack;
        return { id: n.id, text: n.content, css: `font-family:${family};font-size:${(f.size ?? 1) * base}px;font-weight:${f.weight ?? 400};letter-spacing:${typeof f.spacing === "number" ? `${f.spacing}em` : "normal"}` };
      });
    const families = [...new Set((fonts ?? []).filter((f) => f.source?.kind === "data").map((f) => f.family))];
    const got = await page.evaluate(async ({ jobs, families }) => {
      /* A face that has not loaded measures in the fallback, which is the very error this is here to find. */
      for (const fam of families) await document.fonts.load(`16px "${fam}"`).catch(() => {});
      await document.fonts.ready;
      const m = (text, css) => { const s = document.createElement("span"); s.style.cssText = `position:absolute;white-space:pre;${css}`; s.textContent = text; document.body.append(s); const w = s.getBoundingClientRect().width; s.remove(); return w; };
      return jobs.map((j) => {
        const text = j.text;
        const spaces = [...text.matchAll(/ /g)].map((x) => x.index);
        return { id: j.id, words: m(text, j.css), space: m(" ", j.css), without: spaces.length === 1 ? m(text.slice(0, spaces[0]) + text.slice(spaces[0] + 1), j.css) : null, spaces: spaces.length };
      });
    }, { jobs, families });
    /* What this machine's metrics are, against one the capture recorded: the header price as the page drew it. */
    const probe = await page.evaluate((stack) => { const s = document.createElement("span"); s.style.cssText = `position:absolute;white-space:pre;font:600 14.08px ${stack}`; s.textContent = "$116.59"; document.body.append(s); const w = s.getBoundingClientRect().width; s.remove(); return w; }, STACKS.monospace);
    return { byId: new Map(got.map((g) => [g.id, g])), probe };
  } finally {
    await browser.close();
  }
}

/** The box's inner width and whether it holds one line of its own type. */
function room(n, base) {
  const padX = (n.pad?.left ?? 0) + (n.pad?.right ?? 0) + 2 * (n.edge?.width ?? 0);
  const padY = (n.pad?.top ?? 0) + (n.pad?.bottom ?? 0) + 2 * (n.edge?.width ?? 0);
  const line = (n.font?.size ?? 1) * base * (n.font?.leading ?? 1.4);
  return { inner: n.w - padX, oneLine: n.h - padY < 1.5 * line };
}

/** The text parts beside this one in the same parent, in reading order along its line. */
function neighbours(n, nodes) {
  const parent = n.from?.selector?.split(" > ").slice(0, -1).join(" > ");
  if (!parent) return { before: null, after: null };
  const row = nodes.filter((m) => m.pageId === n.pageId && m.id !== n.id && TEXT_KINDS.has(m.featureId)
    && m.from?.selector?.split(" > ").slice(0, -1).join(" > ") === parent && Math.abs(m.y - n.y) <= Math.max(2, n.h / 2));
  const touches = (a, b) => Math.abs(a.x + a.w - b.x) <= 1;
  return { before: row.find((m) => touches(m, n)) ?? null, after: row.find((m) => touches(n, m)) ?? null };
}

/**
 * What the box says about each part's words: `drop` (an inserted space, and
 * the words without it), `lead`/`trail` (a dropped space, and the words with
 * it), or `unclear` (the box says a space is wrong but not which one), with
 * the numbers that said so.
 */
export function verdicts(nodes, measured, base) {
  const out = [];
  for (const n of nodes) {
    const m = measured.byId.get(n.id);
    if (!m) continue;
    const { inner, oneLine } = room(n, base);
    if (!oneLine) continue;
    const over = (m.words - inner) / m.space;
    const says = { id: n.id, pageId: n.pageId, sel: n.from?.selector, text: n.content, inner, words: +m.words.toFixed(1), space: +m.space.toFixed(1), over: +over.toFixed(2) };
    if (over >= BAND.overMin && over <= BAND.overMax) {
      if (m.spaces === 1 && m.without <= inner + 0.5) out.push({ ...says, verdict: "drop", to: n.content.replace(" ", "") });
      else out.push({ ...says, verdict: "unclear", why: m.spaces > 1 ? `${m.spaces} spaces, and the box cannot say which is extra` : "no single space accounts for it" });
      continue;
    }
    if (Math.abs(-over - 1) <= BAND.underTol) {
      const { before, after } = neighbours(n, nodes);
      if (before && !after) out.push({ ...says, verdict: "lead", to: ` ${n.content}` });
      else if (after && !before) out.push({ ...says, verdict: "trail", to: `${n.content} ` });
      else out.push({ ...says, verdict: "unclear", why: before ? "a run touches it on both sides, so the box cannot say which side lost the space" : "no run touches it, so it is not a piece of a joined line" });
    }
  }
  return out;
}

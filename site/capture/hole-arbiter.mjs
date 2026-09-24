/**
 * A SENTENCE TAKES BACK THE WORDS OF THE ELEMENTS INSIDE IT.
 *
 * `own()` (capture-route.mjs) reads an element's own text nodes and joins
 * them, so a sentence with an element inside it loses that element's words
 * and the element becomes a part of its own: "Launch your first token on to
 * see PnL tracking here", with "pump.fun" out at x 984. It is the duplicated
 * button words the other way round.
 *
 * WHERE THE WORDS GO is measured, not guessed. Every place the child's words
 * could go (the start, each space, the end) is tried: the sentence is set in
 * its own face with the child's words there, and the one place that puts the
 * child where its box was recorded, within a quarter of a space, is taken.
 * Exactly one place must fit, or nothing is folded and the ledger says why.
 *
 * THE SPACES EITHER SIDE are measured where the box can tell them apart,
 * and where it cannot they follow the typographic convention (a space
 * between words, none before punctuation) and the ledger says CONVENTION,
 * with the string chosen. It cannot tell them apart in two cases: a centred
 * line, where two missing spaces shorten the line by two and move its start
 * right by exactly one, so "on pump.fun to" and "onpump.funto" put the link
 * at the same x; and the space after a child in a line set from the left,
 * which moves nothing the capture recorded.
 *
 * The folded children stop being parts; their words, ink, weight, face and
 * link become a run in the sentence. The sentence keeps its box.
 */
import { loadChromium } from "./join-arbiter.mjs";

const TEXT_KINDS = new Set(["prose", "value-prop"]);
const STACKS = { monospace: "ui-monospace, 'SF Mono', Menlo, monospace", serif: "Georgia, 'Times New Roman', serif" };
const parentOf = (sel) => (sel ?? "").split(" > ").slice(0, -1).join(" > ");
const cssOf = (n, base) => {
  const f = n.font ?? {};
  const stack = STACKS[f.family] ?? (f.family ? `${f.family}, sans-serif` : STACKS.monospace);
  return `font-family:${f.face ? `"${f.face}", ${stack}` : stack};font-size:${(f.size ?? 1) * base}px;font-weight:${f.weight ?? 400};letter-spacing:${typeof f.spacing === "number" ? `${f.spacing}em` : "normal"}`;
};

/** The sentences with elements inside them, and the children that belong back in them, in reading order. */
export function holesIn(nodes) {
  const out = [];
  for (const p of nodes) {
    if (!TEXT_KINDS.has(p.featureId) || typeof p.content !== "string" || !p.content.trim() || !p.from?.selector) continue;
    const kids = nodes.filter((c) => c.pageId === p.pageId && c !== p && TEXT_KINDS.has(c.featureId) && typeof c.content === "string" && c.content.trim()
      && parentOf(c.from?.selector) === p.from.selector).sort((a, b) => a.y - b.y || a.x - b.x);
    if (kids.length) out.push({ p, kids });
  }
  return out;
}

/**
 * For each hole: the one place the children's words fit, and the spacing,
 * with whether each was measured or is convention. `null` place when no
 * single place fits.
 */
export async function placeHoles(holes, fonts, base) {
  const chromium = loadChromium();
  if (!chromium || !holes.length) return null;
  const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
  try {
    const page = await browser.newPage();
    await page.setContent("<html><body></body></html>");
    const faces = (fonts ?? []).filter((f) => f.source?.kind === "data");
    if (faces.length) await page.addStyleTag({ content: faces.map((f) => `@font-face{font-family:"${f.family}";src:url(${f.source.src});font-weight:${f.weight ?? 400};font-style:${f.style ?? "normal"}}`).join("\n") });
    const jobs = holes.map(({ p, kids }) => ({
      text: p.content.replace(/\s+/g, " ").trim(), css: cssOf(p, base), kidCss: cssOf(kids[0], base),
      kidWords: kids.map((k) => k.content).join(""), kidX: kids[0].x, kidY: kids[0].y,
      x: p.x, y: p.y, padL: p.pad?.left ?? 0, padT: p.pad?.top ?? 0, inner: p.w - (p.pad?.left ?? 0) - (p.pad?.right ?? 0),
      line: (p.font?.size ?? 1) * base * (p.font?.leading ?? 1.4), align: p.text?.align ?? "start",
    }));
    return await page.evaluate(async ({ jobs, families }) => {
      /* A face that has not loaded measures in the fallback: load each one by name first. */
      for (const fam of families) await document.fonts.load(`16px "${fam}"`).catch(() => {});
      await document.fonts.ready;
      const m = (t, css) => { const s = document.createElement("span"); s.style.cssText = `position:absolute;white-space:pre;${css}`; s.textContent = t; document.body.append(s); const w = s.getBoundingClientRect().width; s.remove(); return w; };
      const PUNCT_RE = /^[,.;:!?)\]}%»”’]/;
      return jobs.map((j) => {
        const space = m(" ", j.css);
        if (j.kidY - j.y - j.padT >= j.line) return { place: null, why: "the element sits below the sentence's first line, where its x says nothing about the words before it" };
        const cuts = [0, ...[...j.text.matchAll(/ /g)].map((x) => x.index), j.text.length].filter((c, i, a) => a.indexOf(c) === i);
        const fits = [];
        for (const c of cuts) {
          const A = j.text.slice(0, c).trimEnd(), B = j.text.slice(c).trimStart();
          for (const before of A ? [" ", ""] : [""]) for (const after of B ? [" ", ""] : [""]) {
            const pre = A + before, whole = pre + j.kidWords + after + B;
            const total = m(whole, j.css), lead = m(pre, j.css);
            const start = j.align === "center" ? j.x + j.padL + (j.inner - total) / 2 : j.align === "right" || j.align === "end" ? j.x + j.padL + j.inner - total : j.x + j.padL;
            const off = start + lead - j.kidX;
            if (Math.abs(off) <= 0.25 * space) fits.push({ c, A, B, before, after, off: Math.round(off * 10) / 10 });
          }
        }
        const places = [...new Set(fits.map((f) => f.c))];
        if (places.length !== 1) return { place: null, why: places.length ? `${places.length} places fit, so the box cannot say where the words go` : "no place puts the element where its box was recorded" };
        const at = fits.filter((f) => f.c === places[0]);
        /* The convention, used only to choose among readings the box could not tell apart. */
        const want = { before: at[0].A && !/[(\[{«“‘]$/.test(at[0].A) ? " " : "", after: at[0].B && !PUNCT_RE.test(at[0].B) ? " " : "" };
        const exact = at.length === 1 ? at[0] : at.find((f) => f.before === want.before && f.after === want.after);
        if (!exact) return { place: null, why: `the box allows ${at.length} spacings and the convention's is not one of them` };
        return { place: places[0], A: exact.A, B: exact.B, before: exact.before, after: exact.after, off: exact.off, measured: at.length === 1, readings: at.length };
      });
    }, { jobs, families: [...new Set(faces.map((f) => f.family))] });
  } finally {
    await browser.close();
  }
}

/**
 * A translucent fill arrives as the colour it looks, not as nothing.
 *
 * His active "1W" is `bg-[#00ff00]/10`: the browser reports it as
 * `oklab(0.86644 -0.233888 0.179499 / 0.1)`, a tenth of green over the panel
 * behind it. polio's `parseColor` reads #hex, rgb() and oklch() and drops
 * alpha, so the converter dropped the fill and the button drew as an empty
 * green outline. The page shows a dark green chip. What it shows is what
 * the converter now writes: the tint composited, in sRGB as the browser
 * does, over the nearest painted thing behind it, as an opaque rgb().
 *
 * Also held: the inactive "1D" beside it has no fill and gets none; and no
 * colour anywhere in the document carries an alpha polio would drop.
 *
 *   node site/capture/check-tints.mjs [site/document.json]
 */
import fs from "node:fs";

const file = process.argv[2] ?? new URL("../document.json", import.meta.url).pathname;
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const nodes = doc.nodes ?? doc.state?.nodes ?? [];
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok === true);
  console.log(`${ok === true ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};
const rgb = (v) => { const m = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)$/.exec(v ?? ""); return m ? m.slice(1).map(Number) : null; };
const near = (v, want) => { const c = rgb(v); return !!c && c.every((x, i) => Math.abs(x - want[i]) <= 1); };
const find = (page, words) => nodes.find((n) => n.pageId === page && n.featureId === "cta-primary" && n.content === words);

// A tenth of #00ff00 over the panel rgb(21, 25, 34): rgb(19, 48, 31).
const w = find("page_home", "1W");
check("the active 1W is on the page", !!w);
check("…filled with a tenth of green over the panel behind it", near(w?.colour?.bg, [19, 48, 31]), String(w?.colour?.bg));
check("…so it is a solid button, not an empty outline", w?.options?.variant === "solid", String(w?.options?.variant));
check("…with its green words and green edge as measured", w?.colour?.text === "rgb(0, 255, 0)" && w?.edge?.colour === "rgb(0, 255, 0)", `${w?.colour?.text} / ${w?.edge?.colour}`);

// The same tint over the docs aside rgb(15, 20, 25): rgb(14, 44, 23).
const docs = find("page_docs", "🔥 Burn Tokens. Reclaim SOL.");
check("the docs' active entry is filled the same way over its own aside", near(docs?.colour?.bg, [14, 44, 23]), String(docs?.colour?.bg));

const d1 = find("page_home", "1D");
check("control: the inactive 1D has no fill and gets none", !!d1 && !d1.colour?.bg, String(d1?.colour?.bg));

// Nothing polio reads would lose an alpha: every colour is #hex, rgb() or oklch() with none.
const bad = [];
for (const n of nodes) for (const [k, v] of Object.entries(n.colour ?? {})) {
  if (typeof v !== "string") continue;
  if (/^(rgba|oklab|hsla?|color)\(/i.test(v) || /\/\s*[\d.]+%?\s*\)$/.test(v)) bad.push(`${n.id}.${k}=${v}`);
}
check("no colour in the document carries an alpha polio would drop", bad.length === 0, bad.slice(0, 4).join("; ") || "none");

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

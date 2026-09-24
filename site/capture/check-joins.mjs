/**
 * A PART'S WORDS ARE THE ONES ITS BOX WAS MEASURED AROUND.
 *
 * The capture's `own()` joins an element's text nodes with a space and trims
 * the ends, so "$116.59" came through as "$ 116.59" and " project" as
 * "project". The recorded box was measured off the laid-out page, so it says
 * which: words one space too wide for their one-line box had a space put in;
 * a run whose box is its words plus exactly one space, touching a
 * neighbouring run on one side, had one taken off that side
 * (join-arbiter.mjs).
 *
 * Every expectation here is read off the captures, never written in: the
 * words each element had as captured, measured against its own box in the
 * faces the document carries. The check fails if the captures give it
 * nothing to look at in either direction, so it cannot pass by finding
 * nothing. And it holds the line on guessing: a text the box cannot settle
 * (more than one space, or a run touched on both sides) must be exactly as
 * captured.
 *
 * It measures in a browser on this machine and says what this machine's
 * metrics are against a width the capture recorded.
 *
 *   node site/capture/check-joins.mjs [site/document.json]
 */
import fs from "node:fs";
import { dirname, join } from "node:path";
import { measureParts, verdicts } from "./join-arbiter.mjs";

const here = dirname(new URL(import.meta.url).pathname);
const file = process.argv[2] ?? join(here, "../document.json");
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const routes = JSON.parse(fs.readFileSync(join(here, "routes.json"), "utf8"));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok === true);
  console.log(`${ok === true ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

/* The words each element had as captured, by the path polio records. */
const pathOf = (el) => {
  const bits = [];
  for (let n = el; n.parent; n = n.parent) {
    const same = n.parent.kids.filter((c) => c.t === n.t);
    bits.unshift(same.length > 1 ? `${n.t}:nth-of-type(${same.indexOf(n) + 1})` : n.t);
  }
  return ["body", ...bits].join(" > ");
};
const captured = new Map();
for (const def of routes.pages) {
  const cap = JSON.parse(fs.readFileSync(join(here, "routes", `${def.id}.json`), "utf8"));
  (function walk(el, parent) { el.parent = parent; el.kids = el.kids ?? []; for (const k of el.kids) walk(k, el); })(cap.tree, null);
  (function walk(el) { if (el.text) captured.set(`${def.id} ${pathOf(el)}`, el.text.trim()); for (const k of el.kids) walk(k); })(cap.tree);
}
const asCaptured = (n) => captured.get(`${n.pageId} ${n.from?.selector}`);

/* The document with every part's words put back as captured: what the box is asked about. */
const raw = doc.nodes.map((n) => (asCaptured(n) !== undefined && typeof n.content === "string" ? { ...n, content: asCaptured(n) } : n));
const base = Number(doc.format?.["type.baseSize"] ?? 16);
const measured = await measureParts(raw, doc.look?.fonts, base);
if (!measured) { check("a browser to measure in", false, "no Playwright found; set PLAYWRIGHT_MODULE"); process.exit(1); }
console.log(`  metrics: this machine sets "$116.59" in the site's monospace at ${measured.probe.toFixed(1)}px; the capture recorded that price's box at 59`);
const said = verdicts(raw, measured, base);
const by = (v) => said.filter((s) => s.verdict === v);

check("the captures give the box something to settle in both directions",
  by("drop").length > 0 && by("lead").length + by("trail").length > 0,
  `${by("drop").length} inserted, ${by("lead").length + by("trail").length} dropped, ${by("unclear").length} it cannot settle`);

const node = new Map(doc.nodes.map((n) => [n.id, n]));
/* A part folded back into its sentence (hole-arbiter.mjs) is no longer a part: its settled words are a run of the sentence round it. */
const words = (c) => (typeof c === "string" ? c : (c ?? []).map((s) => s.text ?? "").join(""));
const foldedInto = (v) => doc.nodes.find((n) => n.pageId === v.pageId && Array.isArray(n.content) && v.sel?.startsWith(`${n.from?.selector} > `) && n.content.some((r) => r.text === v.to));
const wrong = (vs) => vs.filter((v) => (node.get(v.id) ? node.get(v.id).content !== v.to : !foldedInto(v)));
const show = (vs) => vs.slice(0, 3).map((v) => `${v.id} ${JSON.stringify(node.get(v.id)?.content)} (captured ${JSON.stringify(v.text)}, box ${v.inner}, words ${v.words})`).join("; ");

const ins = by("drop");
check(`every part whose words were one space too wide for their box has lost that space (${ins.length})`, wrong(ins).length === 0, show(wrong(ins)));
const dropped = [...by("lead"), ...by("trail")];
check(`every run whose box held one more space than its words has it back, on the side its neighbour touches (${dropped.length})`, wrong(dropped).length === 0, show(wrong(dropped)));
const guessed = by("unclear").filter((v) => (node.get(v.id) ? node.get(v.id).content !== v.text : !foldedInto({ ...v, to: v.text })));
check(`what the box cannot settle is left exactly as captured (${by("unclear").length})`, guessed.length === 0, show(guessed));
const moved = doc.nodes.filter((n) => asCaptured(n) !== undefined && typeof n.content === "string" && n.content !== asCaptured(n) && !said.some((v) => v.id === n.id && v.verdict !== "unclear"));
check("no other part's words differ from the capture's", moved.length === 0, moved.slice(0, 3).map((n) => `${n.id} ${JSON.stringify(n.content)}`).join("; "));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

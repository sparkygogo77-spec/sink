/**
 * A button draws the words it folds, and no words a part of its own draws.
 *
 * His wallet button in the header is `button > div > span, span`: the
 * address in green and "7s ago" in grey, a level below the button's direct
 * child. The converter gathered every word in a button's subtree for its
 * label, but folded only a DIRECT child that held words and nothing else. So
 * the two spans came through as parts of their own and the button carried
 * their words as well, drawn in the accent's contrast colour, white, under
 * the green and the grey. On eight of the nine pages; not on the docs page,
 * which has no wallet button.
 *
 * Every figure here is read off the captures, never written in: which
 * buttons carry their own words, which hold them only in direct children
 * that hold nothing else (his sidebar entries: folded, drawn once, by the
 * button), and which hold them deeper. Each shape must be present at least
 * once, so a check that finds nothing to look at fails rather than passes.
 *
 *   node site/capture/check-button-words.mjs [site/document.json]
 */
import fs from "node:fs";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const file = process.argv[2] ?? join(here, "../document.json");
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const routes = JSON.parse(fs.readFileSync(join(here, "routes.json"), "utf8"));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok === true);
  console.log(`${ok === true ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const own = (el) => norm(el.text);
const within = (el) => norm([own(el), ...(el.kids ?? []).map(within)].join(" "));
/** The path polio records in `from.selector` (siteRead.ts#path). */
const pathOf = (el) => {
  const bits = [];
  for (let n = el; n.parent; n = n.parent) {
    const same = n.parent.kids.filter((c) => c.t === n.t);
    bits.unshift(same.length > 1 ? `${n.t}:nth-of-type(${same.indexOf(n) + 1})` : n.t);
  }
  return ["body", ...bits].join(" > ");
};
const under = (p, k) => !!p && !!k && k.startsWith(`${p} > `);
const sel = (n) => norm(n.from?.selector);

/* The captured buttons, by where their words were. */
const shapes = { own: [], leaf: [], deep: [] };
for (const def of routes.pages) {
  const cap = JSON.parse(fs.readFileSync(join(here, "routes", `${def.id}.json`), "utf8"));
  (function walk(el, parent) {
    el.parent = parent;
    el.kids = el.kids ?? [];
    for (const k of el.kids) walk(k, el);
  })(cap.tree, null);
  (function walk(el) {
    if (el.role === "button" && el.t !== "svg" && within(el)) {
      const leaves = el.kids.filter((k) => own(k) && !k.kids.length);
      const shape = own(el) ? "own" : within(el) === norm(leaves.map(own).join(" ")) ? "leaf" : "deep";
      shapes[shape].push({ page: def.id, path: pathOf(el), words: shape === "own" ? own(el) : shape === "leaf" ? norm(leaves.map(own).join(" ")) : within(el) });
    }
    for (const k of el.kids) walk(k);
  })(cap.tree);
}
const count = `own ${shapes.own.length}, in direct children ${shapes.leaf.length}, deeper ${shapes.deep.length}`;
check("the captures hold every shape of button at least once", Object.values(shapes).every((s) => s.length > 0), count);

const nodeAt = (page, path) => doc.nodes.find((n) => n.pageId === page && sel(n) === path);
const worded = (page, path) => doc.nodes.filter((n) => n.pageId === page && under(path, sel(n)) && norm(n.content));

/* THE DEFECT: a button whose content repeats words a part it owns also draws. */
const echoes = doc.nodes.filter((b) => b.featureId === "cta-primary" && norm(b.content)
  && worded(b.pageId, sel(b)).some((k) => norm(b.content).includes(norm(k.content))));
check("no button draws words that a part of its own also draws", echoes.length === 0,
  echoes.map((b) => `${b.id} "${norm(b.content)}"`).slice(0, 3).join("; ") + (echoes.length > 3 ? ` …and ${echoes.length - 3} more` : ""));

/* …and the words of the deeper ones are still on the board, once, in their own parts. */
const lost = shapes.deep.filter((b) => norm(worded(b.page, b.path).map((k) => k.content).join(" ")) !== b.words);
check(`every word inside the ${shapes.deep.length} deeper buttons is still drawn by the part that held it`, lost.length === 0,
  lost.map((b) => `${b.page} ${b.path}`).slice(0, 2).join("; "));
const notButton = shapes.deep.filter((b) => nodeAt(b.page, b.path)?.featureId !== "cta-primary");
check("…and each of them is still a button", notButton.length === 0, notButton.map((b) => b.path).slice(0, 2).join("; "));

/* THE GUARD: the buttons that hold their words in direct children fold them, and nothing else moves. */
const unfolded = shapes.leaf.filter((b) => {
  const n = nodeAt(b.page, b.path);
  return !n || n.featureId !== "cta-primary" || norm(n.content) !== b.words || worded(b.page, b.path).length > 0;
});
check(`all ${shapes.leaf.length} buttons with words in a direct child still fold them: the button draws them, no part of its own does`,
  unfolded.length === 0, unfolded.map((b) => `${b.page} ${b.path}`).slice(0, 2).join("; "));
const ownLost = shapes.own.filter((b) => norm(nodeAt(b.page, b.path)?.content) !== b.words);
check(`all ${shapes.own.length} buttons with their own words still carry exactly those`, ownLost.length === 0,
  ownLost.map((b) => `${b.page} ${b.path}`).slice(0, 2).join("; "));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

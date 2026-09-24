/**
 * A SENTENCE KEEPS THE WORDS OF THE LINK INSIDE IT.
 *
 * His case: the home page reads "Launch your first token on to see PnL
 * tracking here", with "pump.fun" marooned out to the side at x 984. The page
 * is `<p>Launch your first token on <a>pump.fun</a> to see PnL tracking
 * here</p>`. The capture's own() takes the paragraph's own text nodes and
 * joins them, so the anchor's words leave a hole, and the anchor becomes a
 * part of its own. It is the duplicated-button-words defect the other way
 * round: there a parent took its children's words twice, here it has none.
 *
 * Read off the capture, never written in: the paragraph, its link, the
 * link's box and ink and address. The place the link goes is the one whose
 * words before it put it where its box was recorded (join-arbiter.mjs).
 *
 *   node site/capture/check-holes.mjs [site/document.json]
 */
import fs from "node:fs";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const file = process.argv[2] ?? join(here, "../document.json");
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok === true);
  console.log(`${ok === true ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const words = (c) => (typeof c === "string" ? c : (c ?? []).map((s) => s.text ?? "").join(""));

/* The paragraph and its link, as captured. */
const cap = JSON.parse(fs.readFileSync(join(here, "routes", "page_home.json"), "utf8"));
let para = null;
(function walk(e) { if (!para && norm(e.text) && (e.kids ?? []).some((k) => k.t === "a" && norm(k.text))) para = e; (e.kids ?? []).forEach(walk); })(cap.tree);
const link = para?.kids.find((k) => k.t === "a" && norm(k.text));
check("the capture holds his paragraph with a link inside it", !!para && !!link,
  para ? `"${norm(para.text)}" around <a> "${norm(link.text)}" at x ${link.x}, ${link.color}, ${link.href}` : "not found");
if (!para) process.exit(1);

const home = doc.nodes.filter((n) => n.pageId === "page_home");
const sentence = home.find((n) => n.featureId === "prose" && n.y === para.y && n.x === para.x && n.w === para.w);
const said = words(sentence?.content);
check("the sentence carries the link's words, between the words either side of it",
  new RegExp(`\\bon\\s*${norm(link.text).replace(/\./g, "\\.")}\\s*to\\b`).test(said), JSON.stringify(said));
const run = Array.isArray(sentence?.content) ? sentence.content.find((s) => norm(s.text) === norm(link.text)) : null;
check("…as a run of its own that keeps the link's ink", !!run && run.colour === link.color, run ? `colour ${run.colour}` : "no run");
check("…and where it sends people", !!run && new URL(run.link?.target ?? run.link?.url ?? run.link?.href ?? "about:blank").href === new URL(link.href).href, run ? JSON.stringify(run.link) : "no run");
const stray = home.filter((n) => words(n.content).trim() === norm(link.text));
check("no part of its own draws the link's words out to the side", stray.length === 0, stray.map((n) => `${n.id} at x ${n.x}`).join(", "));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

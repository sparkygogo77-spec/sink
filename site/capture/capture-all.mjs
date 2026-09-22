#!/usr/bin/env node
/**
 * Every page in `routes.json`, captured, one file each under `routes/`.
 *
 *   node site/capture/capture-all.mjs [--only <page id>] [--assets <dir>]
 *
 * The route list is the repository's own (see `routes.json`), not a guess
 * at addresses. Each page is `capture-route.mjs` once, with the wallet
 * stand-in, the disclaimer and the button to press as the list says.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, d = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const only = opt("--only");
const assets = opt("--assets", join(here, "..", "..", "assets", "source"));
const routes = JSON.parse(readFileSync(join(here, "routes.json"), "utf8"));

let failed = 0;
for (const p of routes.pages) {
  if (only && p.id !== only) continue;
  const cmd = [
    join(here, "capture-route.mjs"),
    routes.site + p.route,
    join(here, "routes", `${p.id}.json`),
    "--width", String(routes.viewport[0]), "--height", String(routes.viewport[1]),
    "--assets", assets,
    ...(p.wallet ? ["--wallet"] : []),
    ...(p.agree ? ["--agree"] : []),
    ...(p.section ? ["--section", p.section] : []),
    ...(p.click ? ["--click", p.click, "--within", p.within ?? "body"] : []),
  ];
  const r = spawnSync(process.execPath, cmd, { stdio: "inherit" });
  if (r.status !== 0) { failed++; console.error(`${p.id}: capture failed`); }
}
process.exit(failed ? 1 : 0);

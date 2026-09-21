# From a capture to the document

`ccc-capture.json` is a mechanical dump of https://ccc-woad.vercel.app/ taken
from the running browser on 2026-09-21: every visible element with its real
box, its own text and its computed styles. Nothing in it was inferred.

`../document.json` is that capture as the Builder's document, the file the
exact-copy path loads whole. `capture-to-document.mjs` made it, by declared
rules only; `ledger.txt` is what it printed: for every captured property,
where it went — a typed field, a parent it folded into, a CSS default, or
nowhere.

To make it again, from the repository root:

    curl -sSO https://ccc-woad.vercel.app/solworks-logo.png
    curl -sSO https://ccc-woad.vercel.app/solana-logo.png
    node site/capture/capture-to-document.mjs site/capture/ccc-capture.json . --pictures .

A captured image is the picture part's own: `node.picture` names a file
under `assets/pictures/`, written by the converter and committed beside the
document, which is where the exact-copy path fetches it from. Nothing enters
`look.texture`: a page layer is worn by every part, not by the one that
holds it.

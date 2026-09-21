# From a capture to the document

`ccc-capture.json` is a mechanical dump of https://ccc-woad.vercel.app/ taken
from the running browser on 2026-09-21: every visible element with its real
box, its own text and its computed styles. Nothing in it was inferred.

`../document.json` is that capture as the Builder's document, the file the
exact-copy path loads whole. `capture-to-document.mjs` made it, by declared
rules only; `ledger.txt` is what it printed: for every captured property,
where it went — a typed field, a parent it folded into, a CSS default, or
nowhere.

To make it again:

    curl -sSO https://ccc-woad.vercel.app/solworks-logo.png
    curl -sSO https://ccc-woad.vercel.app/solana-logo.png
    node capture-to-document.mjs ccc-capture.json ../.. --pictures .

The two pictures ride inside the document as data URLs, the way the
Builder's own image import carries them, so nothing else is needed to open it.

# From a capture to the document

`ccc-capture.json` is a mechanical dump of https://ccc-woad.vercel.app/ taken
from the running browser on 2026-09-21: every visible element with its real
box, its own text and its computed styles. Nothing in it was inferred.

`../document.json` is that capture as the Builder's document, the file the
exact-copy path loads whole. `capture-to-document.mjs` made it, by declared
rules only; `ledger.txt` is what it printed: for every captured property,
where it went — a typed field, a parent it folded into, a CSS default, or
nowhere — and the overlaps in the measured geometry, listed pair by pair.

To make it again, from the repository root:

    curl -sSO https://ccc-woad.vercel.app/solworks-logo.png
    curl -sSO https://ccc-woad.vercel.app/solana-logo.png
    node site/capture/capture-to-document.mjs site/capture/ccc-capture.json . --pictures .

What each element becomes: its own part, at its own box, chosen by what the
element itself draws. Own words on a heading are a `value-prop`, on a
painted or edged button or link a `cta-primary`, otherwise `prose`; an
`img` is the `picture` part holding `node.picture`, a reference to a file
under `assets/pictures/` committed beside the document; an svg and any
element with no words of its own is `box`, the plain part that draws
nothing of its own. Every node carries what the capture recorded of its box
in the four node fields — `layout`, `pad`, `edge`, `text` — except a button,
which draws its own edge and padding.

There are no groups: a container is a box holding its children by geometry,
and nothing else wraps them. Nothing enters `look.texture`.

A fixed or absolute element keeps the box it was measured with at scroll 0,
and its band is written after the parts that flow, lowest z-index first, so
it paints over them as the browser did. The overlaps that were measured are
the page's own and are kept.

# From the captures to the document

`../document.json` is https://ccc-woad.vercel.app as the Builder's document,
the file the exact-copy path loads whole: nine pages, every visible element
of each as its own part at its own box. Made by declared rules only, against
polio trunk 8998cec; `ledger.txt` is what the converter printed — for every
captured property, where it went (a typed field, a parent it folded into, a
CSS default, or nowhere), page by page.

## The files

- `routes.json` — the site's pages, read from its source (the zip in this
  repository's history, commit 9bd8288): two routes, `/` and `/docs`, and
  the eight sections of the sidebar, which switch in place on `/` and are
  each captured as the page they are on screen. `sections` says which page
  each sidebar button leads to.
- `capture-route.mjs` — one mechanical dump of one page or one state of it:
  the tree from `body`, every visible element with its real box, its own
  words and its computed styles; the page's `@font-face` rules; an icon's
  strokes with their geometry; a button's `title`.
- `capture-all.mjs` — every page in `routes.json`, into `routes/<id>.json`,
  with the bytes (pictures, font files) under `../../assets/source`.
- `capture-to-document.mjs` — the captures as the document.
- `ccc-capture.json` — his original dump of `/`, 2026-09-21, kept as the
  record. The document is made from `routes/page_home.json`, taken the same
  way at the same size, so all nine pages are measured alike.

To make it again, from the repository root:

    node site/capture/capture-all.mjs
    node site/capture/capture-to-document.mjs site/capture/routes.json . --assets assets/source > site/capture/ledger.txt

## What a captured element is, before what it looks like

Every element carries the role the browser's accessibility tree computed
for it, its accessible name, its states, and for a field its type and
placeholder. The part is chosen from the role first — heading, paragraph,
image, button — and from shape only where the tree gave none. Where the
library has no part for a role (link, navigation, banner, main,
complementary, contentinfo, list, listitem, textbox) the look stays exactly
what the shape rule draws, and the role travels anyway: in the label every
surface shows (`textbox “Ask or search...”`, `link “Documentation”`), in the
prompt the blueprint writes, and for textbox, button and link in `data`,
which the blueprint writes under "What the backend must provide", with type,
placeholder, name and state. The accessible name is what recovers the
sixteen icon-only documentation links and the header's person button, which
had no words on the page. His search field is a `textbox`: the page declares
no search role, so none is written, and its placeholder travels as evidence.
A typed field for the role would be cleaner than label, prompt and data; that
is a change to polio's node, not to this converter.

## What a captured element becomes

Its own part, at its own box, chosen by what the element itself draws. Own
words on a heading are a `value-prop`, on a painted or edged button or link
a `cta-primary`, otherwise `prose`; an `img` is the `picture` part holding
`node.picture`, a reference to a file under `assets/pictures/` committed
beside the document; an `svg` whose strokes were captured is a `drawn-icon`
holding them as `node.vector`, drawn as outlines or fills as the page drew
them; any element with no words of its own is `box`, the plain part that
draws nothing of its own. Every node carries what the capture recorded of
its box in the four node fields — `layout`, `pad`, `edge`, `text` — except a
button, which draws its own edge and padding. The face a part is set in
(`font.face`) is carried in `look.fonts` with its file, Latin subset only,
by polio's own rules (`fonts.ts#carryFaces`); a generic keyword such as
`ui-monospace` is the machine's own face and is named as such.

There are no groups: a container is a box holding its children by geometry,
and nothing else wraps them. Nothing enters `look.texture`.

An `href` whose path is a route of the site is `{ kind: "page" }`, a page in
the document; anything else stays an address. A sidebar button carries the
page its section was captured as.

## The wallet, and what the capture cannot answer

The sidebar and every section it leads to render only with a wallet
connected. A headless browser has no wallet, so the captures of `/` and its
sections use a stand-in Phantom provider (`--wallet`) with a fixed key that
signs nothing. The address on the wallet button is the stand-in's, not his;
the live numbers (SOL price, the burn feed) are whatever the site showed at
the moment; every section shows what it shows a wallet that holds nothing.

Words set in `ui-monospace` were measured in this machine's monospace face,
which is wider than the one his capture was measured in: the same label
came in at 85px on his machine and 92px here. Words set in Press Start 2P,
a carried face, measure the same on both.

## The button ruling, pending

The ruling is that a thing that is a button with words on it becomes a
button part carrying those words. The constraint on it is that a button
that came from a capture keeps the colour, weight and edge the capture
recorded. The `cta-primary` part cannot hold them as it stands: it sets its
words in the accent's contrast colour, its weight at 700, its edge at 2px
in the accent, and centres them; his inactive sidebar entries are grey,
weight 400, unedged, set left beside an icon. Which gives way is his call,
so the eight sidebar buttons, and the two icon-only documentation links,
stay what the capture measured — a box holding an icon and words — with
the page each leads to carried as `node.link` on the box. A box does not
press a link. The head of `capture-to-document.mjs` says the same.

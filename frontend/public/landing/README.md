# One-scroll

A landing page that tells a story in one scroll over a moving surface of contour rings. It was
built for Atropos (prediction-market odds, calibrated, priced against your holdings) and is kept
here on its own so it can be the start of another project.

**Live: [ebeirne.github.io/one-scroll](https://ebeirne.github.io/one-scroll/)**

No build, no framework. One HTML file, two JavaScript modules, some JSON and three photos.

## Run it

Any static file server from this folder:

```
npx serve .
```

or `python -m http.server 8000`, then open the page. (Opening `index.html` straight from disk
does not work: browsers block module scripts and JSON fetches on `file://`.)

## How the page works

Scrolling drives one timeline, in "units" 0 to 13:

| Units | What happens |
|---|---|
| 0 → 2 | plays on load: the camera settles, the hero words blur in |
| 2 → 10.27 | tied to the scroll above the content: the hero fades, the camera dives into the rings, the lens goes wide, the first title appears, then the second, the surface rises until only a dark hole is left, the dark veil comes in |
| 11 → 13 | tied to the footer coming into view: a grey version of the rings rises behind it |

- `topo/timeline.js` holds every keyframe (camera position and rotation, lens, cut height,
  shadow, blur, colour fringing, grain, and when each title shows). Each keyframe is
  `[position, value, handles]`; segments ease along a cubic bezier.
- `topo/surface.js` draws the rings: twenty stacked planes cut by one noise height field at
  twenty thresholds, so only the rim of each terrace shows. A small fluid field the cursor stirs
  ripples them. Then a directional blur, exposure, chromatic aberration and grain. A bowl is sunk
  into the field where the camera dives, so the rings converge on that point. `createSurface`
  returns `{ setTime(t), quality(q), pause(), resume() }`.
- `index.html` has the markup, the CSS and the page script: it maps scroll position to timeline
  units, fades the hero and the two titles, pins the "Three engines" title, reveals sections,
  and fills the data sections.

## Make it yours

1. **Copy.** Every line is in `index.html`: the hero (`#heroTitle`, `#tagline`), the two scroll
   titles (`#title0`, `#title1`), the sections. Section titles are `h2.h-section`.
2. **Sections.** The page follows this order: hero → two titles → "where the name comes from" →
   two numbered blocks → a pinned title with three figures → three cards with photos → a framed
   grid of eight → numbered rows → footer. Keep, cut or reorder the `<section>` blocks; the
   scroll mapping only needs `#scrollEnd` (where the dive ends) and `#footStart` (the footer).
3. **Data.** The page script fetches `tape.json`, `data/basis/*.json`, `data/leaf/scan.json`
   and `atty/thread.json`, trying `api/...` first (for a server) and falling back to the files.
   Replace the fetches and the three `render` blocks with your own, or delete them and write
   the content in by hand.
4. **Surface.** In `surface.js`, `BASE.hero.noise.bowl.center` is where the rings converge (in
   0–1 plane coordinates); `uNoiseOffset` raises or lowers the whole field against the cut
   height; the colours are the `uColor1..5` greys. Lower `quality` on weak machines.
5. **Fonts.** Hanken Grotesk (display and small caps) and Space Mono (body), from Google Fonts.

## Credits

The ring surface, the scroll choreography and the section grammar follow
[topology.vc](https://www.topology.vc/), rebuilt from scratch in three.js. Photos are public
domain or CC0, credited in `photos/credits.json`. Data snapshots come from the Atropos project
and its two joined engines, Basis and Leaf: [github.com/ebeirne/atropos](https://github.com/ebeirne/atropos).

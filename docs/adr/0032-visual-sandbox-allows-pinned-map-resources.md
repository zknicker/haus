---
summary: Decision to widen the visual sandbox CSP to four exact jsdelivr files — D3, topojson-client, and two atlases — so agents can draw real geographic maps, and to keep every future addition pinned the same way.
read_when:
  - changing the visual sandbox CSP, its CDN allowlist, or connect-src
  - adding a library or data file the visual fence may load
  - changing what the visuals skill teaches about maps or geography
---

# ADR 0032: The Visual Sandbox Allows Pinned Map Resources

## Status

Accepted, 2026-09-18. Extends the single-pin CDN posture that shipped with the
visual sandbox ([ADR 0010](0010-widgets-use-tagged-fences.md)'s renderer, frame
per [ADR 0031](0031-visuals-render-inline-not-carded.md)). The sandbox
itself — opaque origin, `srcDoc`, never `allow-same-origin` — is unchanged.

## Context

A choropleth is the one chart shape an agent cannot fake. Bars, lines and
sparklines are arithmetic on a viewBox, but a map needs the actual coastline:
hand-drawn state or country outlines come out as recognizable-but-wrong
cartoons, and no amount of skill guidance fixes that, because the geometry is
data the model does not have. Until now the fence's only external source was
the pinned Chart.js file and `connect-src` was `'none'`, so an agent asked for
"sales by state" had nothing honest to draw.

The shape of the answer is already settled elsewhere: Claude Code's widgets
draw maps with D3 plus topojson-client, fetching topology from the `us-atlas`
and `world-atlas` packages on jsdelivr at render time. Two projections cover
nearly every request — `geoAlbersUsa()` over the `states` object,
`geoNaturalEarth1()` over `countries`.

## Decision

Four more resources are reachable from the fence, each pinned to an exact
version and an exact path on the same CDN as the Chart.js entry:

- `d3@7.9.0/dist/d3.min.js` and `topojson-client@3.1.0/dist/topojson-client.min.js`
  join `script-src`, narrowed all the way to the file rather than the
  versioned directory Chart.js uses.
- `us-atlas@3.0.1/states-10m.json` and `world-atlas@2.0.2/countries-110m.json`
  become the whole of `connect-src`, which is no longer `'none'`.

`connect-src` lists files, never an origin, because it is the fence's only
outbound channel and the body is attacker-controlled. CSP path matching does
not cover the query string, so the pin bounds which server and which file a
fetch may reach, not the bytes a malicious body could append to the URL; those
land in jsdelivr's logs, which an attacker cannot read back. That residual is
the price of maps, and it is why the list stays files-only.

The constants are exported beside `visualChartJsUrl`
(`apps/website/src/features/chats/visual-card.tsx`) and mirrored in
`VisualSandboxDocument` on iOS, and both suites pin the assembled policy string
character for character and assert no other origin and no wildcard appears.

Adding a fifth resource follows the same four steps: exact version, exact path,
a test pin on both platforms, and an amendment here. A version bump is the same
decision in miniature — it updates the CSP, the skill guidance and the tests
together.

## Consequences

Agents can draw US-state and world choropleths that are geographically true,
and the supply-chain surface grows by three immutable artifacts and one
outbound destination rather than by an origin. An offline or CDN-blocked client
degrades the same way it already does for Chart.js: the script or fetch fails
and the visual renders without its map.

Maps now arrive after the first size report, because the topology is fetched.
The frame's `ResizeObserver` already re-reports the taller body, so the host
resizes on its own; the lab renderer gained an opt-in `ready: 'network'` wait
so a captured screenshot shows the drawn map instead of an empty container.

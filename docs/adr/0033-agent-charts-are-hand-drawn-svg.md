---
summary: Decision to draw every agent chart as inline SVG assembled from a scale recipe, retiring Chart.js from the sandbox and adopting Claude's dataviz categorical palette.
read_when:
  - changing what the visuals skill teaches about charts, scales, or fragments
  - changing the visual sandbox CSP or its CDN allowlist
  - changing the chart palette, `--chart-1..5`, or the chart chrome tokens
  - adding or editing a chart fragment or its lint rules
---

# ADR 0033: Agent Charts Are Hand-Drawn SVG

## Status

Accepted, 2026-09-22. Amends [ADR 0032](0032-visual-sandbox-allows-pinned-map-resources.md)
(Chart.js leaves the allowlist; the four map resources stay) and extends
[ADR 0012](0012-design-guidance-is-skill-carried.md).

## Context

The visuals skill shipped on 17 July SVG-first, and its bar fragment was a
fixed-coordinate drawing: real numbers baked into real `x` and `width`
attributes. Models copied those pixels verbatim. A fragment sized for four bars
came back with four bars in a slot built for twelve, and the same thin-bar
artifact showed up across five different models, because copying a fragment
faithfully is what models do best. The bug was in the fragment's design, not in
the models.

On 17 September (`33eab920f`) and 18 September (`60b18ed08`) the skill answered
that by making Chart.js the default for every chart with an axis. Geometry
became right by construction, and the thin bars went away. But the trade was
worse than it looked. A library brings defaults that leak. Chart.js draws its
stock black tooltip over a Haus surface, and its hover colors are derived by
`@kurkle/color`, which cannot parse the oklch our tokens resolve to and falls
back to solid black, so hovering a bar turned it black. Charts became
JavaScript instead of markup, which means nothing renders until the fence
closes, so a streaming chart is a blank box rather than a drawing that fills
in. The CDN pin had to be mirrored on iOS and pinned character for character in
two test suites. And because artifact pages have no network at all, the skill
had to teach two chart dialects: Chart.js for visuals, hand-drawn SVG for
artifacts.

## Decision

Charts are inline SVG and HTML, assembled by the agent. No charting library.

The skill teaches a scale recipe rather than a drawing: the agent computes a
domain, maps it onto a plot rectangle, and emits marks from that mapping, so
geometry is derived from the data in the fence instead of inherited from
whatever numbers the fragment's author had. Fragments become worked examples
with the derivation visible rather than pixel templates, which is what makes
them safe to copy. A canonical inline hover script, shared by every chart,
replaces library tooltips, so the readout wears published tokens like the rest
of the frame. One y-axis per chart by default: two units mean two paired
panels stacked under one title. A second axis is drawn only when the user asks
for bars and a line on one plot, and then both axes start at zero so the
overlay cannot manufacture a correlation.

Chart.js leaves the CSP on both platforms. `visualChartJsUrl` and
`VisualSandboxDocument.chartJsURL` are gone, and `script-src` now names only
the two map libraries, each narrowed to its exact file. The four map resources
of ADR 0032 are untouched: a choropleth still needs real geometry.

The palette moves with it. `--chart-1..4` become Claude's dataviz categorical
slots (blue, orange, aqua, yellow) in that fixed order, and `--chart-5` stays
the zinc neutral for baselines and de-emphasis. The four were validated against
`--surface` in both schemes for adjacent-pair separation under color vision
deficiency and for a shared lightness band. Red is no longer a series color; it
belongs to status alone, which retires the old ordering rule that held red back
because it reads as a verdict.

## Consequences

One dialect covers both surfaces: what an agent writes into a visual fence is
what it writes into an artifact page, and an artifact page with no network
draws the same chart. Charts stream, because markup renders as it parses. The
supply-chain surface shrinks by one script and one versioned-directory prefix,
and the two test suites that pin the policy character for character get shorter
rather than longer.

The cost is that correctness now lives in guidance instead of a library, so it
has to be tested. The visuals lint tests check SVG anatomy: the accessible role
and title, the scale derivation, the hover layer, published tokens only. The
visuals lab battery is the gate for regressions, rendering every fragment
through the real frame in both schemes and across models, since a rule that one
model follows and another ignores is a rule that has not landed.

Two alternatives were rejected. Theming Chart.js through injected
`Chart.defaults` fixes today's black tooltip and black hover, but keeps every
structural cost: the CDN pin, the iOS mirror, no streaming, and a second
dialect for artifacts. Keeping Chart.js as an escape hatch for hard charts
keeps two dialects too, and the hatch is exactly where the leaked defaults
would survive.

- Visuals already stored in chat history that load Chart.js now fail the
  sandbox CSP on web and iOS, so the `<canvas>` shows its fallback text
  instead of the chart. The old skill required every canvas to carry the
  takeaway and its numbers as fallback, so these degrade to a sentence rather
  than to a blank, and they are not migrated.

# Haus visuals — diagrams

Read [design-system.md](design-system.md) first. Then read the ONE fragment
file the index points at and change its content.

## Fragment index

| The shape | Read |
| --- | --- |
| Steps in order, one running | [pipeline](fragments/pipeline.md) |
| A root over its branches | [hierarchy](fragments/hierarchy.md) |
| Who calls whom, in order | [sequence](fragments/sequence.md) |
| What happened, when | [timeline](fragments/timeline.md) |
| States and the transitions between them | [state-machine](fragments/state-machine.md) |

## Nodes and connectors

- A node is a plate: `--surface-secondary`, `--radius`, `--pad-sm`, no border.
  One node at most may be highlighted, and it takes `--accent-bg` with
  `--accent-foreground` text — never a second accent in the same diagram.
- Connectors are `--border-strong` at 1.5px, straight, and they stop at the
  edge of a node, never at its center. Arrowheads are part of the same stroke.
- Direction carries meaning: left to right for a pipeline or sequence, top to
  bottom for a hierarchy, a state machine, or a timeline.
- Every edge is labeled. An unlabeled transition is a guess.
- Past about nine nodes a diagram stops being readable. Group into labeled
  clusters, or send the detail to a Markdown table in the reply.
- Status on a node is a dot plus a word, never color alone.

## Hand-drawn SVG

A chart with an axis follows charts.md; a diagram is hand-drawn SVG or plain
HTML and needs no scale.
Three things break hand-drawn SVG, so check all three before closing the fence:

- **Text fits.** `chars × budget + 2 × padding ≤ box width`, with 4px minimum
  between text and any edge. Budgets are in design-system.md.
- **The viewBox closes.** The lowest `y + height` plus descenders clears the
  viewBox by 8px, nothing exceeds its width, and connectors stop at edges.
- **Text does not scale.** An `<svg>` at `width: 100%` with a viewBox blows its
  text up on a wide screen. Cap it:
  `style="width:100%;max-width:700px;height:auto"`, and set
  `font-family: var(--font-sans)` on the `<svg>` so the text inherits the app
  font instead of the browser's serif default.

Plain HTML beats SVG whenever the diagram is rows and boxes — a timeline, an
org chart, a pipeline. Real text in real elements never needs a fitting check.

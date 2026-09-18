# Haus visuals — components

Read [design-system.md](design-system.md) first. Then read the ONE fragment
file the index points at and change its content.

## Fragment index

| What you are making | Read |
| --- | --- |
| A few headline numbers | [kpi-row](fragments/kpi-row.md) |
| Headline numbers that must show a trend on their own | [tile-with-sparkline](fragments/tile-with-sparkline.md) |
| Two or three options side by side | [comparison-cards](fragments/comparison-cards.md) |
| One product, listing, order, or contact | [record-card](fragments/record-card.md) |
| Job or sync health, one row each | [status-list](fragments/status-list.md) |
| One number against a limit | [meter](fragments/meter.md) |
| A number the reader should be able to move | [calculator](fragments/calculator.md) |
| A table that sorts, filters, or belongs to a record | [table](fragments/table.md) |

## The plate and the card

Almost everything here is a **plate**: `--surface-secondary`, `--radius`,
`--pad-md`, no border. Plates sit straight on the conversation, because the
conversation is the container. A plate on a plate goes `--surface-tertiary`,
and three levels of nesting is the ceiling.

The one exception is the **record card**: a bordered `--surface` box at
`--radius-card`, for a single bounded object the reply is about. One card, with
an edge, because the object has an edge. A row of record cards is a table; send
it to the reply.

## Tiles

- At most four tiles in a row,
  `grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))` and
  `gap: var(--gap-sm)`. Columns take `minmax(0, 1fr)`: a bare `1fr` floors at
  the content width, so one long label blows the column instead of truncating.
- Label 12px `--muted-foreground`, value 24–36px weight 500 with `line-height`
  at least 1.08, delta chip underneath. Values are compact and rounded — whole
  dollars, `12.9K`, `$4.2M`, never cents.
- Tiles alone answer no trend question. Either put one chart under the row, or
  give each tile a sparkline.
- A delta chip's color is direction × whether up is good: revenue up is
  `--success-bg`, returns up is `--error-bg`. `--warning-bg` is for stale or
  missing states — not synced, no data — never for a drop. Every chip carries a
  label; color never carries meaning alone.

## Meters and progress

A meter is one number against a limit — spend against budget, units against a
target. Never a two-slice pie.

- Track and fill are the same hue: the track is a light step
  (`color-mix(in srgb, var(--chart-1) 14%, transparent)`), the fill is solid.
  A gray track under a blue fill reads as two unrelated things.
- The fill turns `--error` only when the value has actually breached the limit,
  and then the row carries a chip saying so. Status color is a verdict.
- State both numbers in text beside the meter. A bar with no numbers is
  decoration.

## Native controls

The frame already styles bare `input`, `select`, `textarea`, `button`,
`input[type=range]`, and `table`, and sets `accent-color`. Write the bare tag —
a hand-built control looks alien. An interactive visual:

- Sets `step` on every range and number input, so no drag can produce a number
  with fourteen decimals.
- Rounds every value it prints, including the ones it computes. Cents appear
  only where the unit is genuinely sub-dollar — a per-unit royalty, a list
  price. Totals and tile values stay whole.
- Shows invalid input as a 12–13px `var(--error)` message inline and does not
  advance. `--error-foreground` is the text color on the `--error-bg` tint, not
  on the page.
- Updates on `input`, never on a submit button, and never fetches anything.

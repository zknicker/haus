# Haus visuals — components

Read [design-system.md](design-system.md) first. Then read the ONE fragment
file the index points at and change its content.

## Fragment index

| What you are making | Read |
| --- | --- |
| A few headline numbers | [kpi-row](fragments/kpi-row.md); in a report, the plate-less stat row in [report](fragments/report.md) |
| Headline numbers that must show a trend on their own | [tile-with-sparkline](fragments/tile-with-sparkline.md) |
| Two or three options side by side | [comparison-cards](fragments/comparison-cards.md) |
| One product, listing, order, or contact | [record-card](fragments/record-card.md) |
| Job or sync health, one row each | [status-list](fragments/status-list.md) |
| One number against a limit | [meter](fragments/meter.md) |
| A number the reader should be able to move | [calculator](fragments/calculator.md) |
| A table that sorts, filters, or belongs to a record | [table](fragments/table.md) |
| A mockup of a product screen, or alternative designs for one | [UI mockups](#ui-mockups), no fragment |

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
- Title 12px `--muted-foreground`, value 24–36px weight 500 with `line-height`
  at least 1.08, then one chip or one secondary fact underneath.
- Tiles alone answer no trend question. Either put one chart under the row, or
  give each tile a sparkline.

### Tile grammar

Every tile is written the same way, so a row reads the same whichever model
wrote it:

- **Title**: the metric, sentence case: `Revenue`, `Units`, `Returns`. When the
  tiles in one row cover different periods, every title names its period as
  `Metric · period`, and the middle dot is the only separator. Periods come
  from one list: `today`, `yesterday`, `7d`, `30d`, `MTD`, a date `Sep 14`, a
  range `Sep 1–14` (en dash, no spaces). Months take three letters: `Sep`,
  never `Sept`. No commas, no parentheses, no prefixed period
  (`30-day revenue`), and no bare period as a title; `Today` alone titles only
  the not-synced tile, whose value is `—`.
- **Value**: whole numbers with thousands separators through 9,999, then
  compact from 10,000 with at most one decimal and no trailing zero: `$6,630`,
  `$14.4K`, `$28K`, `1.2M`. Percents take one decimal below 10 and none from
  10: `6.0%`, `48%`. Negative money reads `-$100`. Never cents; a per-unit
  price or royalty is the one exception.
- **Chip**: at most one per tile, in exactly one of three shapes. Every chip is
  a word or number with a tint, never color alone.
  - *Change*: arrow, amount, `vs`, comparator: `↑ 6.0% vs prior 7d`. The
    comparator is one of `prior 7d`, `prior 30d`, `prior day`, `prior week`,
    `prior month`, `7d avg`, `30d avg`. A rate changes in `pts` (percentage
    points, the difference between two rates: `6.5%` to `6.9%` is
    `↑ 0.4 pts`, never `↑ 6%`) (`↑ 0.4 pts vs prior 7d`); a count under 20
    changes by its difference (`↑ 4 vs prior 7d`); a change under 0.5% either
    way reads
    `flat vs prior 7d`. Color is direction × whether up is good: revenue up is
    `--success-bg`, returns up is `--error-bg`, flat is the neutral chip.
  - *Ratio*: `48% of $30K goal`, `92% of units`. Always the neutral chip,
    `--surface-tertiary` with `--foreground` text, never a status tint.
  - *Status*: `Not synced yet` or `No data`, on `--warning-bg`. This is the
    only use of warning; a drop is a change chip, never warning.
- **Secondary fact**: `39 sold · 4 returned` is not a chip. It is 12px
  `--muted-foreground` text under the value, in place of a chip.
- **Count**: at most four tiles. Add a `Today` tile only when the question is
  about today; never pad a row with one.

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

## UI mockups

A mockup of a product screen or flow — "show me two or three ways this banner
could look", "what would the composer look like with X" — is a use for the
visual fence, not an artifact, when it fits the reply column.

- **Build it from the host's tokens**, so it reads as the real app: surfaces
  (`--background` for the screen ground, `--surface`, `--surface-secondary`),
  `--border` hairlines, `--radius` / `--radius-card`, `--font-sans` at the app's
  sizes, real copy and plausible numbers. Controls are bare `button`, `input`,
  and `select`, styled by the frame. No lorem ipsum, no gray boxes standing in
  for text.
- **One frame per variant**: the mocked component's own surface — the banner,
  the panel, the composer — drawn once, bordered `--surface` if that is how it
  looks in the app. Never wrap it in a second page or window card, and never
  set a plate inside that frame just to hold it. Surrounding chrome for context
  (a page title, a header row) sits unframed above it; the visual itself has no
  outer card.
- **Labeled variants, stacked vertically.** Each variant opens with a bold
  sentence-case label outside its frame, 14px weight 500 — "Now", "1. Inline progress banner ·
  recommended", "2. Compact chip in the header" — then the mockup under it,
  `--gap-lg` between variants. Show the current state first when there is one.
- A goal or progress mockup shows actual against pace as a meter with a pace
  tick and the gap in words ("$381 ahead of pace"). Never a cumulative line on
  a pace line: a few percent apart, they draw as one line.
- Show only the slice of the screen the change touches, with just enough
  surrounding chrome to place it. No hover layer, no working logic unless the
  user asked to try it.
- The trade-offs between variants go in the reply, not under the mockups — and
  the reply names the pick and why, without re-describing what each variant shows.

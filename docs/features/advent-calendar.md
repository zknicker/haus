---
summary: The Christmas advent calendar, "Your year in Haus" — the Inbox chip, the 24-door dialog, today's reveal, opened-door memory, and the dev date override.
read_when:
  - changing the advent calendar chip, dialog, doors, day card, or recap
  - changing which ornament a year-in-Haus fact shows, or the advent art assets
  - changing the advent.calendar read or how the App asks for it
  - testing a seasonal feature outside its season (haus.debug-today)
---

# Advent Calendar

"Your year in Haus" is a December advent calendar on the Inbox: one painted door a day from Dec 1 to
Dec 24, each revealing one fact about the member's year in this Server, in the innkeeper's voice.
Dec 24 opens the recap. It exists only under a Christmas color theme (the `snowy-roofline` scene)
and only from Dec 1 to Jan 6 in the member's local time.

## The chip

A small secondary chip sits after the Inbox date, in the greeting's column
(`features/advent/advent-chip.tsx`, mounted by `InboxHeader`). It shows today's painted door,
"Day N", and an accent dot while today's door is still shut. From Christmas Day it reads
"Your year" with the lit niche and no dot. The chip is the date line's own height, so it never moves
the greeting, the date or the Agent strip.

## The dialog

Pressing the chip opens a HeroUI Modal: "Advent · December" over "Your year in Haus", a close button,
and a 6×4 grid of doors (`advent-calendar.tsx`, `advent-door.tsx`).

| Door | Looks | Tooltip | Press |
| --- | --- | --- | --- |
| Past | Open: the lit niche with the day's ornament | `Dec N · title`, then the line | Shows its card |
| Today, shut | The closed door with a breathing candle glow | Today's door. Open it. | Opens it (below) |
| Today, opened | Swung back on its hinge beside the niche | As a past door | Shows its card |
| To come | Frosted, desaturated, padlocked | Opens on December N. | Nothing |

From Dec 25 every door is open. Opening the dialog never opens today's door; pressing it does.

**The reveal.** Today's door swings open on its left hinge (0.5s), the ornament pops out with a burst
of warm glints, and at 0.95s the day card slides in and takes the doors' place: the doors are hidden
(not unmounted) and the dialog fits the card. The card is the ornament at 96px beside
"Day N · December N", the title, and the line with its `strong` runs bold, with "See all days" right
under the line; it brings the doors back with focus on that door. Dec 24's card is the recap: the
stats grid, the closing line, then "See all days". With reduced motion there is no swing, pop or glint, and the card shows at once.

## Data

The doors render from local state at once; the `advent.calendar` read (`packages/haus-api/src/advent.ts`,
`hooks/advent/use-advent-calendar.ts`) fills only their words. The App sends the Server id, the
calendar year, `throughDay` (today's door, or 25 for all) and its IANA time zone. While the read is
pending a card's text stays blank, with no skeleton. If it fails, today's door still opens and the
card says "The ledger's stuck in the snow. Try again in a bit." No stats are ever invented.

## Ornaments

The App owns which painted ornament each fact shows (`features/advent/ornaments.ts`), so the art says
something about the fact. Each of the 24 is used once: the loudest channel is a drum, the busiest
hour a bell, files shared a present, tokens used a lantern, the recap the star. The art is Codex
image gen, split into one PNG per sprite under `features/advent/assets/` (ornaments at 192px,
256-colour; doors and niche at 140px tall, full colour).

## Opened doors

Which doors the member opened is app-local presentation, per device: localStorage
`haus.advent-opened:<serverId>:<year>`, a JSON array of door numbers, read through
`useOpenedDays` (a `useSyncExternalStore` store that follows other windows). Only today's door
needs it: past doors are open regardless.

## Dev date override

In development builds only, localStorage `haus.debug-today` = `YYYY-MM-DD` stands in for today
(`features/advent/local-today.ts`, `useLocalToday()`), so December features can be checked in
November. Production builds ignore it. Reload after setting it in the same window. The sleigh ride
reads the same helper. The Server's door gate would still refuse a December `throughDay` in
November, so a Server running with development auth (`HAUS_DEV_STACK=1`, the switch behind
`/auth/dev/session`) skips that gate and serves any door's copy. A production Server never has
development auth and keeps the gate.

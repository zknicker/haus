---
summary: Decision to render inline visuals as a transparent block in the reply column instead of a bordered card, so the conversation is the container.
read_when:
  - changing the inline visual frame, its width, or its sandbox base styles
  - changing what the visuals skill teaches about cards, tiles, and plates
  - changing the visuals lab's host page that stands in for the transcript
---

# ADR 0031: Visuals Render Inline, Not Carded

## Status

Accepted, 2026-09-18. Supersedes the card shell that shipped with
[ADR 0010](0010-widgets-use-tagged-fences.md)'s renderer and the full-width
decision of 7d4a56099, which removed the visual's 46rem cap three days
earlier. Fence grammar, sandbox posture, CSP, and the size handshake are
unchanged.

## Context

Every ```` ```visual ```` fence rendered inside a `card-shell` — a 1px
`--border`, `--surface` fill, the card radius — spanning the full message
width, with 16px of padding inside the sandbox document. Two costs followed.
A visual read as an object dropped into the chat rather than part of the
reply, and because the frame was a card, every tile the model drew inside it
was a card in a card; the skill had to spend a rule ("the frame is already a
card") holding that back. Full width also broke the left-to-right measure:
prose and visual no longer shared a column.

Claude Code's widget container is the reference: `display: block`,
`width: 100%` of the prose column at 680px, transparent, no border, no
wrapper. Its guidance states the same rule from the other side — no card
wrapper, prose flows naturally, whitespace is the container — and reserves a
raised card for a bounded object the model draws itself, such as a contact
record.

## Decision

The host draws no shell. A visual is a plain block capped at 46rem (736px,
near Claude's 680px) with a transparent iframe inside it, left-aligned with
the text above it. The reply prose itself is not capped — it fills the
message column, roughly 1070px at a 1440px viewport — so a visual reads as a
figure held to a measure rather than a band across the turn; `max-w-[46rem]`
is the same measure narration text and legacy widget rows already use. The
sandbox document keeps
`background: transparent` and insets only `8px 0`: vertical breathing room,
no horizontal padding, because the column already supplies the gutter and
the visual's left edge must align with the prose above it.

The conversation is the container. Tiles and plates sit directly on the page
as `--surface-secondary` at `--radius` with no border. A bordered
`--surface` card is drawn only for a bounded object — a record, a receipt —
never as a wrapper. The ```` ```artifact ```` fence keeps its card: an
artifact is a link to a durable page, which is a bounded object by
definition.

iOS mirrors the web frame, and the visuals lab's renderer and page mirror it
in turn, so a rendered evaluation shows what the transcript
shows.

## Consequences

The visuals skill loses a rule and gains a truth: "the frame is already a
card" becomes "the conversation is the container", pinned in
`managed-skills.test.ts` so the retired wording cannot return. Visuals that
relied on the shell's fill for contrast now sit on `--background`; a model
that wants a surface draws a plate. A visual is now narrower than the prose
around it; if that reads wrong in practice, the cap is one class, and the
alternative is capping the reply column itself rather than widening visuals. Historical visuals re-render under the
new frame, which is the intent — the fence body is the durable artifact, the
frame never was.

The lab host page's column default moves from 820px to 736px, so
before/after render batteries are not pixel-comparable across this change.

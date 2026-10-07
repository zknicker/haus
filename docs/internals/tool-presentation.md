---
summary: Turn activity presentation from durable Server evidence and Computer-relayed execution details.
read_when:
  - changing turn activity rows, the turn-details drawer, or the Agent Activity tab
  - changing execution-journal presentation or access
  - adding presentation for a Computer-reported tool event
---

# Turn Activity Presentation

Haus Server owns the durable product timeline. Computer owns execution state
and runtime access. The App presents those sources through an App-owned
transcript contract; it does not call an execution runtime or a retired local
Server API directly.

## Data paths

Durable messages and semantic turn activity are read from Haus Server and
projected by `features/servers/chat/` into
`features/chats/transcript-contract.ts`. Transcript components render only that
presentation contract.

Detailed execution is optional, ephemeral evidence. `hooks/members/use-turn-journal.ts`
is its one owner: while a detail surface is open and the viewer's role allows it,
`use-agent-execution-journal.ts` asks Haus Server for one run, and Server relays the
request to the Agent's assigned Computer. A live run re-asks on the run's own
`agent.onActivity` events — never on a timer. The result deliberately bypasses React
Query: it is neither canonical collaboration state nor a durable App cache entry.

## Summary and detail

Haus shows turn activity twice, and the two must not converge. **Summary** is the
high-level verb — `Thinking…`, `Ran a command`, `Sent a message` — in the transcript,
avatar hover cards, and the inbox. **Detail** is
`features/turn-trace/`: one chronological column of the Computer's reasoning blocks and
tool calls, rendered by the turn-details drawer (`server-turn-details-drawer.tsx`) and the
Agent profile Activity tab.

`turn-trace-model.ts` builds that column. Server semantic verbs stay out of it, since the
journal already shows the work they summarize; the one exception is `received_message`,
Server history no journal holds, which joins the column at its time as a `Received a new
message` step. `turn-trace-view.ts` groups that column into steps (folds, Haus
bookkeeping, Thought rows, parallel lanes, totals) on the turn's time axis. Bookkeeping lifts out to where it first happened: one
call stays its own muted row, and only two or more become one muted `Haus bookkeeping` row
whose members carry the specifics. A fold
keys by its first call, so in a live turn a call that gains a same-kind sibling becomes the fold
in place, and an open fold stays open as calls join it. A run of title-only reasoning (Codex's
`**Planning…**` lines) is one `Thought` step at its place in time, never a caption on the next
step: the latest title is its muted detail, its bar spans the run's blocks, and a run of several
opens to every title, oldest first.

The view renders on one locked row grid (`turn-trace-grid.tsx`), never a stack of bordered
cards or nested containers. Every row at every depth — call, fold, Haus bookkeeping, sub-agent, a
sub-agent's own calls, reasoning — shares four columns: a label cell (`clamp(8rem, 45%, 28rem)`,
so it narrows with the trace), a flexible waterfall track, a fixed right-aligned tabular duration
that never wraps (and states nothing for a settled step under a second), and a disclosure slot reserved on leaves so labels never shift. Depth indents
inside the label cell only (`--trace-indent`: 0.75rem per plain step, 1.25rem into an opened group), so the track and duration columns
land at the same x on every row. A row is a kind mark (or a danger, warning, or stop mark for its
outcome), the label, the muted directory, and a dotted leader from the label's end that runs on
through the track at the row's center; the step's bar (6px, full radius) sits over that leader on
the turn's axis, ringed in the trace's ground so it reads as cut from the line. Each kind of work
has one hue (`TraceKind` in `turn-trace-kind.ts`) that paints the row's icon, its bar, and its
Activity overview segment: thinking, shell, files (reads, edits, writes, search), web, sub-agents,
image or media, and MCP or other tools. Haus bookkeeping stays the quiet muted wash, an interrupted
step quiet, and a failure or warning paints danger or warning over any hue. Labels stay neutral.
An unread turn's overview segments come from its Computer outline, whose tool steps carry the
`toolKind` that `readExecutionToolKind` in `@haus/api` assigns, the same classifier the trace
uses, so an unread turn colors its calls as a read one does (tokens in `product-tokens.css`,
palette in `DESIGN.md`). Bookkeeping is shared the same way: `isExecutionBookkeeping` in
`@haus/api` (a script of only `haus` CLI calls once `cd`/`echo` setup is set aside, a native
message send, or root `MEMORY.md` upkeep) sets the trace's `isBookkeeping` and the outline's
`bookkeeping` step kind, and both test against `@haus/api/execution-bookkeeping-fixtures`. A
failed or interrupted bookkeeping call keeps its own kind and outcome mark in both. Hierarchy is indent, mark,
bar color, and one rail: a sub-agent's calls are rows one depth in, with no background or edge of
their own. An opened group — a fold, Haus bookkeeping, a sub-agent's fact line and calls, a run of
thoughts — hangs its children off one 1px `separator` rail at the center of its row's icon, file
tree style (`TraceGroup`, `TraceElbow` in `turn-trace-depth.tsx`): each child gets a square elbow
on its row line (a thought on its first line), ├ for every child and └ for the last, where the
rail ends. The connector stops just short of the child's icon. Each child draws its own stretch of
rail over its whole height, so an opened child's body keeps the rail running to later siblings;
a sub-agent's fact line takes a plain stretch with no elbow, and its report sits past the rail's
end. Rails and elbows stay inside the label cell, paint over row tints and highlights, and
straddle the icon's center so they snap to whole device pixels. A nested group draws its own.
A failed row tints whole — fill, bar, and leader — and stays closed until someone opens it. Steps that ran side
by side share time on the bars, and a parallel fold draws its members as stacked lanes in one bar.
While the turn runs, the axis is its elapsed time, so bars rescale (200ms linear), the running bar
pulses, and a new row fades and rises into place; all of it is off under reduced motion.

Everything a row opens to that is not itself a row — its evidence, a sub-agent's fact line and
report, a sent message — starts on the row's label text (`TraceBody`, `traceTextInset`). In a
chat's trace it runs to the edge; in the log it stays in the time and label columns while the track
column beside it keeps the turn's gridlines (`TraceLane`), so the 0 edge and the ticks run unbroken
from the ruler to the last row with bodies open. A body shows everything on open, with no
disclosure inside it: a failed command reads `ERROR`, then `COMMAND`, then `OUTPUT`; a sent message
reads `TO`, `MESSAGE`, `COMMAND`, `OUTPUT`; an MCP or generic call reads `INPUT` and `RESULT`. Every
section label is one micro label (`TraceMicroLabel`, uppercase), and only labels are uppercase:
what they name stays in sentence case (`Command failed · exit code 1`). Short facts (`TO`, `FILE`,
`PATH`, `TOOL`, `EXIT CODE`) are a `TurnTraceFacts` list with micro-label keys.

Code sections are the stock CodeBlock on the theme's compact trace modifier
(`turn-trace-code.tsx`, `.code-block--compact`): `xs` mono on a 1.5 line, the fields radius tier,
a slim header holding the micro label and copy. Multi-line text carries line numbers from the same
`.code-block--numbered` counter rule the workspace file view uses; a one-line shell command sits at
a muted `$` prompt instead. Terminal escapes a command printed are stripped from its output. A block
longer than ten lines folds to eight with `Show N more lines` at its bottom (`turn-trace-fold.ts`),
and copy always takes the whole text; prose sections (a report, a message, a prompt) share the same
surface and fold at a height with `Show more`. Text past 20,000 characters is clamped with a note.
A tool payload that is, or parses as, a JSON object or array within that bound renders as a JSON
tree instead (`turn-trace-json.tsx`, `TraceValue`): a React Aria tree on the same compact surface,
first level open, closed containers stating their size (`{3 keys}`, `[12]`), long strings folded
until their row is pressed, keys and literals in the `--code-constant` ink and strings in
`--code-string` (the CodeBlock's GitHub themes), arrow keys to walk and open it, and per-row copy
on hover or focus. The drawer
closes the trace with a footer (`turn-trace-footer.tsx`): calls, sub-agents, images, and failures
as tabular figures over micro labels, closed by the wall time labelled `Running` while the turn
works and `Done` once it settles. The Activity tab's event log
(`members/agent-profile/agent-activity-log*.tsx`) states no totals: each turn's header carries its
length, and its steps render through `TurnTraceSteps` on the log's grid (`TraceLayoutProvider`
`layout="log"`), which leads every row with the step's offset from the turn's start and drops the
track below a 42rem log. Each turn keeps its own scale, but the log gives it a visible one: the
turn's axis rounds up to a clock step it can count in four intervals or fewer (1/2/5 below a
minute, then 1, 2, 5, 10, 15, 30 minutes; `turn-trace-scale.ts`), so a 32s turn draws on 0–40s
and a 6m10s turn on 0–8m. An open turn draws that ruler on its own thin, inert row under the
header, in the track column only (`TurnRuler`, `turn-trace-ruler.tsx`): a hairline baseline, a short tick and a tiny muted tabular label per
step. Its step rows carry the ticks down as gridlines (`--trace-grid`), the 0 line darker
(`--trace-axis`) as the steps' shared left edge; they live inside each row's track and each open
body's lane, so they continue past a step's evidence and never cross into another turn or the label
and duration columns. In
the log a row's dotted leader stops at that 0 edge, so the lane holds only gridlines and bars. A
running turn's scale steps up as its elapsed time grows, and the ticks slide with the bars. The
header's own track column stays empty, and its Chat button shows at that column's end on hover or
focus, fading nothing; a collapsed turn
or a narrow log has no ruler. The overview strip keeps the turn's unrounded span. The journal reports tokens only per sub-agent, so neither states any for
the turn. In the drawer the turn's outcome chip leads the trace; with no steps to
total, the turn's own record says how long it took, and a turn's own `failure` reads as a danger
note above the rows rather than "No activity was recorded". A row is a stock `Disclosure`, whose
trigger is the whole row and its one tab stop (Enter or Space toggles it, the ring is
keyboard-only), only when it opens to something (`hasCallBody`); the stock panel animates its
height both ways, and its body mounts on first open, so a long turn pays for what someone reads.
Running steps shimmer in the present tense, and the elapsed times tick from a one-second clock
that runs only while the journal is running (`use-turn-trace-now.ts`). `turn-trace-tool-model.ts` classifies one journal tool by wire
name into a kind (`shell`, `file-write`, `file-edit`, `file-read`, `search`, `web`, `image`, `mcp`,
`message`, `file-change`, `compaction`, `subagent`, `generic`) with typed fields;
`turn-trace-tool-label.ts` names its row and `turn-trace-tool-bodies.tsx` owns the body each kind
earns. Codex's and Grok Build's native media tools (`image_gen`, `image_edit`, `image_to_video`,
`reference_to_video`) are `image`: `Generated an image`, `Edited an image`, or `Made a video`, with
the file and the prompt as the body. The file is the workspace file Computer journals as `path`
(`generated-images/…`, see [Agents](../features/agents.md)), falling back to the runtime's own
`savedPath`. An image step is a closed row like any other; opened, it shows the picture, read
through the same `agent.workspaceFile` query the workspace pane uses, with its prompt folded to
three lines; a
video, a host-only path, or a failed read names the file instead. Nothing renders while it
loads. Pressing the picture (Enter or Space) opens it in a HeroUI Modal at the window's size
with its file name and prompt, and on desktop an "Open in workspace" action that opens the file
as an artifact page; the web omits it, since the trace has no Artifact Panel. The harness's reserved
synthetic names get their own kinds so they read as what happened — `Modified <path>`,
`Compacted the context` — rather than a generic call with empty arguments.

A sub-agent is a call the runtime reported with `subagent` metadata (never a wire-name
guess). `buildTurnTrace` nests every call whose `parentToolCallId` names it under that row,
in start order; a child whose parent is missing, or a malformed parent cycle, stays
top-level so no evidence is hidden. The row reads `Ran sub-agent: <label>` (or `Running`,
`failed`, `interrupted` from the sub-agent's own status), its trailing meta is its tool count
with any failed child calls counted in danger (a completed sub-agent with failures takes
the warning mark), and its duration sits in the duration column. Opened, it is one muted line on
its label text — its type only when it is not `general-purpose`, its tokens, its duration — then
its child calls as rows one depth in on the trace's columns, then its `REPORT` section, so the
sub-agent's markdown never reads as one more step. Only a failed call, top-level or
nested, takes the danger mark, and once opened its readable `failure` leads its body as
one line under `ERROR` (message · exit code, never the transport payload). A command that exited
non-zero journals its printed output as the failure message, so a failed shell call states
`Command failed · Exit code N` and keeps the command and that output behind its quiet `COMMAND`
disclosure; an interrupted one stopped because the turn ended, so it
settles with a muted stop mark, stays closed, and its body says why it stopped. The Agent hover card carries only a count and
elapsed time from current activity's `activeDelegations`, shown while any are running.

## Row labels

A row states what the Agent did, not what a runtime typed. Two derivations own that,
both pure and both proved on their own:

- `turn-trace-shell-label.ts` names a shell call. It unwraps the runtime's own wrapper
  (`/bin/zsh -lc "…"`, `bash -lc`, `sh -c`), takes the first non-empty line, drops a
  trailing heredoc opener, collapses whitespace, and caps the result. A compound script
  reads as its most meaningful command, never as shell syntax: `if`/`then`/`while` lead
  the command they guard, `fi`/`done`/`[` never name a row, and a pipeline with a plainer
  name reads as its purpose (`find packages -type f | wc -l` → `Counted files in packages`).
  A real `haus`
  command — the Agent CLI names in `apps/computer/src/agent-cli.ts` — reads as the
  product action it is, from its parsed arguments (`turn-trace-haus-command.ts`):
  `Sent a message to #product`, `Sent a message to DM` (never the peer's name),
  `Replied in DM` for `--reply-to`, `Replied in thread` for a `:<shortId>` target,
  `Claimed a task`, `Reacted`, `Set a reminder`. The muted bookkeeping row already
  says it is Haus, so no label says "with haus". A `haus message send` opens to the
  message itself — its place and its heredoc or here-string body as markdown under
  `MESSAGE` — with the command and the CLI's reply behind one quiet, closed `COMMAND`
  disclosure.
- `turn-trace-reasoning.tsx` presents a reasoning block as a step like any other: one line on
  the grid that opens to its prose. Codex opens each summary with a bold title line, so that
  title names the row (through the transcript's `parseThinkingSummary`) and the rest is the body;
  untitled reasoning's row reads `Thought`. The body's first line rides the row as muted detail,
  and the row opens to the whole body on the label text; a title with no body is a plain row.

Reasoning bodies are model-authored markdown and render through `ReferenceMarkdown`,
the same safe renderer a message uses — `react-markdown` with no raw-HTML pass.

The trace owns its motion and disclosure state. A trace the relay answers after its view
opened, and a step a live turn adds, grow into place (`turn-trace-reveal.tsx`); a view
that closes keeps its last trace, and reopening shows it while the relay refreshes. In the
Activity log, each turn is a stock `Disclosure` (never a group), and each step row is its own
disclosure, closed until opened, failed or not; plain rows still take the hover fill there,
since pointing at one lights its span in the overview. Shared, high-churn log state
— the linked hover between strip and rows, each turn's step marks, and the journal read queue
(at most three in flight) — lives in small external stores (`agent-activity-log-stores.ts`) so a
hover re-renders only the rows that read it. The strip's marks for unread turns come from Computer
outlines (`use-turn-outlines.ts`): one `agent.executionOutlines` read per Agent per day page,
settled outlines reused across days and revisits and never read again, unanswered runs read again
when a Computer comes back online. An opened turn's journal marks replace its outline's.

Row labels stay in sentence case. Body sections are named on the one micro-label tier
(`DESIGN.md` → Turn trace); `default-theme.css` moves stock `ChatTool`'s own section labels
from an off-scale 10px onto that tier's `xs` step.

## Rules

- Product history remains useful while Computer is offline. Missing execution
  detail degrades the trace to its semantic events and states why; it never
  removes or gates the transcript, and it never hides the events it does have.
- The App sends Server, Agent, and run identity. It never chooses a runtime
  base URL, auth token, runtime session, or runtime-specific chat id.
- Reusable row, actor, composer, and drawer types belong to the App feature.
  Boundary adapters may consume `@haus/api`; presentation components must not
  import a Server router merely to inherit its output types.
- Semantic activity is the default human-readable evidence. Raw execution
  journal data is restricted to the access policy enforced by Server.
- A managed instruction, Cove factory-guidance, or Harness bootstrap refresh is durable semantic activity:
  `Updating instructions…`, `Updated instructions`, or `Failed to update instructions`. It exposes
  only the lifecycle outcome; instruction text, hashes, paths, commands, and raw errors stay local.
- Tool-specific labels and bodies extend `features/turn-trace/` for detail and
  `features/chats/tool-steps/` for inline summary rows, but their input must come
  through the transcript contract or the execution-journal path. They must not
  restore a direct Runtime fetch.
- A tool body reads unknown payloads through `turn-trace-values.ts` and degrades to
  JSON. No runtime result shape is trusted. codex-acp's shell result is
  `{ formatted_output, exit_code }`; an exit code shows only when non-zero. A
  runtime file change (`fileChange`, folded from Codex's `apply_patch`) carries the
  ACP edit result, one `{ type: 'diff', path, oldText, newText }` per file: a created
  file shows its contents and a modified one its diff.
- The AI SDK harness shows the Agent workspace relative: a path inside it loses the
  workspace prefix, and a bare mention of the workspace itself reads `<workspace>`
  (Haus's `@ai-sdk/harness` patch; upstream wrote `.`, which turned
  `cwd is /…/workspace.` into `cwd is ..`). The journal stores that display text.
  The patch only reaches the top-level Agent, so Computer applies the same rule (plus
  `~/` for the Agent home) to every string it serves from the journal, sub-agent
  calls included, and adds a normalized `failure: { message, exitCode? }` beside each
  raw tool `error` and on a failed turn; prefer it over parsing `error`.
- A step whose start and end arrived together shows no duration. Codex reports a
  fast command's or patch's ACP start and completion in the same instant, and its
  own measured duration for them is also zero, so there is no real span to state.
- Nothing bounds a model- or MCP-authored payload, and one opened body can hold any of it, so text is clamped by character
  (`clampTraceText` / `clampTraceValue`) before it reaches a code block, a diff, or a
  stock `ChatTool` block. A line-count collapse alone does not bound one unbroken line.
- Detail bodies compose the stock Pro chat primitives — `ChatTool.Args`/`Result` for a
  raw payload and `ChatSource` for a citation — and the app's one diff renderer for an edit. Source pills carry no third-party favicon, which
  would leak every visited host to an icon service.

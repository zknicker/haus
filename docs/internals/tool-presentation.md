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
message` step. Reasoning and that step share `TurnTraceStep` (`turn-trace-blocks.tsx`), whose
box matches a ChatTool trigger's so every step's icon sits in the tool status-icon column. `turn-trace-tool-model.ts` classifies one journal tool by wire
name into a kind (`shell`, `file-write`, `file-edit`, `file-read`, `search`, `web`, `mcp`,
`message`, `file-change`, `compaction`, `generic`) with typed fields;
`turn-trace-tool-bodies.tsx` owns the body each kind earns. The harness's reserved
synthetic names get their own kinds so they read as what happened — `Modified <path>`,
`Compacted the context` — rather than a generic call with empty arguments.

## Row labels

A row states what the Agent did, not what a runtime typed. Two derivations own that,
both pure and both proved on their own:

- `turn-trace-shell-label.ts` names a shell call. It unwraps the runtime's own wrapper
  (`/bin/zsh -lc "…"`, `bash -lc`, `sh -c`), takes the first non-empty line, drops a
  trailing heredoc opener, collapses whitespace, and caps the result. A real `haus`
  command — the Agent CLI names in `apps/computer/src/agent-cli.ts` — reads as the
  product verb it is (`Sent a message with haus`), because that is activity that
  merely happens to be typed at a shell. The Command body still shows the original
  verbatim.
- `turn-trace-reasoning.tsx` presents a reasoning block in place, with no disclosure.
  Codex opens each summary with a bold title line, so that title leads (through the
  transcript's `parseThinkingSummary`) and the rest is the body; untitled reasoning is
  all body, with no invented label. A body longer than roughly ten prose lines folds
  to six behind a Show more button, decided from the text so the fold never appears
  late.

Reasoning bodies are model-authored markdown and render through `ReferenceMarkdown`,
the same safe renderer a message uses — `react-markdown` with no raw-HTML pass.

The trace owns its motion and disclosure state. A trace the relay answers after its view
opened, and a step a live turn adds, grow into place (`turn-trace-reveal.tsx`); a view
that closes keeps its last trace, and reopening shows it while the relay refreshes. In the
Activity tab, rows open and close with one animated height transition: a reopened row
grows to the trace it kept exactly as a collapsing row shrinks from it, and only a row
opened before its first trace arrives opens at once and lets the trace grow in. Each tool row is
its own disclosure: the trace resets React Aria's disclosure-group context, so the
Activity tab's turn accordion never owns a call's open state.

Labels stay in sentence case. Stock `ChatTool` sets its `Arguments`, `Result`, and error
labels in ALL CAPS, which `DESIGN.md` forbids; `default-theme.css` returns those three
BEM parts to the trace's own small muted role.

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
- A step whose start and end arrived together shows no duration. Codex reports a
  fast command's or patch's ACP start and completion in the same instant, and its
  own measured duration for them is also zero, so there is no real span to state.
- Nothing bounds a model- or MCP-authored payload, and every tool body in a trace
  mounts behind its disclosure at once, so text is clamped by character
  (`clampTraceText` / `clampTraceValue`) before it reaches a code block, a diff, or a
  stock `ChatTool` block. A line-count collapse alone does not bound one unbroken line.
- Detail bodies compose the stock Pro chat primitives — `ChatTool` for a call and
  `ChatSource` for a citation — and the app's one diff renderer for an edit. Source pills carry no third-party favicon, which
  would leak every visited host to an icon service.

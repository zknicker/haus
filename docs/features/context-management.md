---
summary: Fresh-session instruction composition, MEMORY.md and AGENTS.md rule delivery in the turn input, and persistent Agent context.
read_when:
  - changing generated Agent instructions
  - changing session resume, reset, model switching, or recovery
  - changing runtime launch config, Agent HOME setup, or what a runtime loads from disk (AGENTS.md, CLAUDE.md, settings)
  - changing how MEMORY.md reaches the turn input, its 8,000-character cap, or the memory receipt
  - changing how the AGENTS.md rule layers reach the turn input on a Computer, or their receipts
  - changing compaction, idle compaction, or the Idle compaction Server setting
  - changing the composer's context ring or what the Context popover counts
---

# Context Management

Context management composes the instructions for an Agent's single global
model session. Per-turn message delivery is an inbox concern; see
[Agent Inbox](../../specs/inbox.md).

## Contract

- Computer composes managed product instructions, the Agent description, the house
  `## Personality` (every Agent, right after `## Who you are`), the Agent's private
  `## Conversation style` directly after it when set, its signature emoji in the pickup rule, assigned skills, and tool guidance for every accepted turn. It persists the
  delivered instruction and Harness bootstrap fingerprints with the resumed session.
- Computer does not append Haus-specific model-family steering. Every model receives the same
  managed product contract; executor-native instructions remain owned by that executor.
- Instructions include current time, home timezone, and the rule that old
  context and prior data reads must be rechecked.
- The model session spans every Chat the Agent participates in and resumes
  between deliveries and Computer restarts.
- `MEMORY.md` in the Agent's Drive area (`drive/agents/<handle>/MEMORY.md` from its working
  directory) is the Agent's memory, and the Computer delivers it: at turn
  start it reads the file and puts it in the turn input when its content differs from what this
  session last received. An unchanged file adds nothing to the turn; a missing file delivers
  nothing. Delivery is capped at 8,000 characters: a longer file is cut at a line boundary under
  the cap, with a notice in the same block naming the file's size and the cap and asking the Agent
  to tighten it. A memory receipt (content digest) works like the instruction receipt: it advances
  only after a turn that carried the file or whose own edits produced the current content, and it
  resets on a fresh session or a compacted turn, so the next turn carries the file again
  ([ADR 0052](../adr/0052-memory-is-one-capped-file-and-heartbeats-retire.md),
  [Agent Workspace](../../specs/workspace.md#memory)). The Agent reads any other notes it needs
  itself.
- The rule layers arrive the same way, ahead of `MEMORY.md`: `drive/haus/AGENTS.md`, then its
  home Project's `drive/projects/<key>/AGENTS.md`, then the Agent's own
  `drive/agents/<handle>/AGENTS.md`, each in a `<haus-rules>` block when its content
  differs from what this session last received, and a deleted layer is announced once
  ([ADR 0054](../adr/0054-drive-holds-what-agents-know-and-follow.md) decision 7). The change test
  is `planRulesDelivery` in `@haus/agent-prompt`, shared with the runner; the Computer reads the
  files from the drive/ folder (`apps/computer/src/harness/rules-delivery.ts`) and keeps one
  digest per layer in the session record. The receipts behave like the memory receipt: a
  completed turn holds the files as it left them, a sub-agent wake defers a change, and a fresh
  session or a compaction (in a turn or idle) clears them.
- Every turn runs in the Agent's one main session. Haus runs no scheduled, unprompted turns:
  heartbeats and the nightly dream retired with ADR 0052.
- Explicit MCP requests use the fixed `execute` tool to discover and invoke currently granted
  Server tools. MCP grants and discovery results never change the host-tool catalog.
  Missing tools call for the specific connection or grant to be repaired; local configuration
  searches do not establish Server-owned MCP access. General capability selection still considers
  other authorized execution methods, and requested setup troubleshooting can inspect local state.
- Ordinary requests continue in the Chat where they were asked, from acknowledgment to result,
  following the human's lead across turns. Work that outlasts a reply, delegated Worker work included,
  goes in a Task, which holds its progress and result
  ([ADR 0053](../adr/0053-channels-and-tasks-are-the-only-places.md)). Questions to a person are @mentions where the work lives, and automation placement follows its own contract.
- Sessions never rotate because of age or idle time.
- A session launches on the current composed instructions, but no runtime re-reads them on resume.
  When a resumed session's delivered-instruction fingerprint differs or is missing, its next
  ordinary turn starts with a `<haus-instructions-update>` block carrying the full current
  instructions, without session rotation; a release that changes only host facts sends none
  ([sessions spec](../../specs/sessions.md#instruction-updates)). Bootstrap drift (a changed
  runtime CLI pin) or Restart parks the session at the turn boundary, refreshes the driver's
  install, and resumes that conversation. Activity History records the
  update as started, completed, or failed without prompt text, local paths, commands, or hashes.
- Fingerprints advance only after the refreshed turn successfully detaches with new resume state,
  and the instruction receipt only on a turn that launched on or carried the current instructions
  (a sub-agent wake defers the update to the next ordinary turn). A turn the runtime compacted sets
  the receipt back to the launch instructions, since compaction can summarize the update away.
  A bootstrap or turn failure keeps the previous receipt and session generation so a later delivery
  can retry. Only rejection of the stored native resume state enters Server-authorized session
  recovery; Computer never silently discards conversation context.
- The independently released Haus Agent version is the public receipt for this managed behavior,
  including instructions, actions, recipes and Manual content, runtime bootstrap, and factory
  guidance. Version drift uses the same next-turn refresh path. Computer marks the version current
  only after a successful turn that delivered any due instruction update, preserves the previous applied version on failure, and reports the
  pending/current/failed state to Server for the Agent profile. Exact fingerprints remain
  Computer-local implementation evidence.
- A fresh session starts only for initial creation, a runtime, model, or reasoning-effort switch,
  manual session reset, or one automatic recovery after the runtime rejects a stored resume state.
- A rotation posts no message in any chat and draws nothing in the transcript. It is recorded
  durably and stamped on the Agent's messages (`sessionGeneration`).
- An execution-configuration change never interrupts an active turn. The active turn finishes
  with its frozen runtime, model, and reasoning effort; Server then rotates the session, applies
  the new configuration, and uses it for the next turn.
- A fresh session with pending work uses its notice or typed attention as the
  first prompt. `Start.` is used only when no delivery is pending. Later
  deliveries resume the same session without replaying that marker.
- Creating an Agent schedules no continuation for its creator. The create receipt
  is returned in the same command, and the new Agent is woken once for its
  greeting — by then its standing brief, if any, is already in the workspace
  memory the Computer seeded. The run that carries the greeting opens with Raft's
  one-time instruction to post one short self-introduction in `#all`, its only
  introduction; a delivery already waiting, such as the creator's @mention, rides
  the same turn. The instruction shows on whichever run carries the greeting,
  warm or cold, and once that run settles no later turn repeats it.
- Restart recreates the Agent runner and resumes the same native conversation.
  Its next delivery uses the same refresh path without rotating the session generation or
  replaying `Start.`.
- Session reset preserves workspace, memory, skills, identity, and Server
  history. Full reset deletes the Agent's Drive area (restorable from Recently deleted for 30
  days), clears its local state, and the next launch seeds a starter `MEMORY.md` and the
  factory-managed skills.

The composed instructions are bounded by a size cap asserted in
`packages/agent-prompt/src/managed-instructions.test.ts`. It is a ratchet that forces a deliberate
decision, not a hard or runtime limit: a justified addition raises the cap with a recorded reason,
and other prompt text is never cut just to make room. Raft-verbatim text is never trimmed. See
AGENTS.md and [the divergence register](../../specs/raft-alignment/prompt-divergences.md).

Durable Agent knowledge lives in the Agent's Drive area (`MEMORY.md`, notes and
skills). Only `MEMORY.md` and the three `AGENTS.md` rule layers reach the turn input, and only
when they changed. Agents
read older canonical Chat history through the `haus` CLI when inbox delivery is
insufficient.

A model's context is the composed instructions, `MEMORY.md` and the rule layers as the
Computer delivers them, the workspace files the Agent chooses to read, and its isolated
`HOME` (skill links and runtime state). No runtime auto-loads `AGENTS.md`,
`CLAUDE.md`, or an equivalent from the workspace, its ancestors, or the
operator's home. Computer enforces this per runtime:

| Runtime | Ambient instruction loading | Haus setting |
| --- | --- | --- |
| Claude Code | `project`/`local` settings (`CLAUDE.md`, `.claude/`) in the workspace and every ancestor | `--setting-sources user` and `--strict-mcp-config`; Agent `HOME` keeps its own `.claude.json`, never a link to the operator's (login resolves from host credentials) |
| Codex | `AGENTS.md` in the workspace and every directory up to its git root | `project_doc_max_bytes = 0` on every thread request; isolated `CODEX_HOME` |
| Grok Build | Claude/Cursor files (`.claude/CLAUDE.md`, `.claude/rules/`, `~/.claude/`), plus generic names below | `GROK_{CLAUDE,CURSOR}_{AGENTS,RULES}_ENABLED=false`; isolated `GROK_HOME` |

Known gap: Grok Build 1.0.13 has no switch for generic `AGENTS.md`,
`CLAUDE.md`, `AGENT.md`, `CLAUDE.local.md`, or `.grok/rules/` in the workspace
and every directory up to its git root, and its binary cannot be patched. Outside a git repository
(the shipped `~/.haus/computer` layout) it reads only the workspace itself, so a
Grok Agent still sees such files it or a repository puts in its workspace. Haus instructions reach Grok through `$GROK_HOME/AGENTS.md`. This table
describes the Computer Agent drivers, whose launch and isolation tests left with them when Agents
moved to the runner; Workers launch with the machine's own settings instead
([specs/runtime-drivers.md](../../specs/runtime-drivers.md#workers)).

Sub-agents run on Claude Code only, in the foreground or the background, as in Raft. A
background sub-agent or shell outlives the turn that starts it: that turn ends, the Agent stays
reachable for new messages, and when the work finishes Claude Code starts a turn of its own to
report it, which Haus runs as a sub-agent wake (specs/runtime-drivers.md "Background work"). The
one long-lived `claude` process per Agent session carries the work between turns, so the warm
pool never closes it for idleness while work runs. Since Claude Code 2.1.317 an Agent call that
does not set `run_in_background` runs in the background. Every sub-agent starts blank-slate: fork
sub-agents, which would inherit the whole global session, are off
(`CLAUDE_CODE_FORK_SUBAGENT=0`). At most four sub-agents run at once
(`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). `Monitor` stays in the disallowed tools
(`CLAUDE_DISALLOWED_TOOLS`). Codex launches with `agents.enabled = false`
and `features.multi_agent = false` in its thread config (`codexThreadConfig`), and Grok Build with
`GROK_SUBAGENTS=0`, so neither offers a spawn tool.

Compaction is the runtime's own. Claude Code compacts a session that nears its context window
during a turn, and the turn reports it as the synthetic `compaction` tool pair. A parked `claude`
process closes after an hour idle, matching its one-hour prompt cache; the next turn resumes the
same conversation in a new process.

Claude Code's idle compaction (2.1.299+, a session over 200K tokens idle for about 54 minutes)
never arms for the `sdk-ts` entrypoint Haus launches, so Haus runs it: with the Owner's Server
setting **Idle compaction** on (Settings → General → Captains; off by default), the Computer
compacts a parked Claude Code session at Claude Code's own time and thresholds, with Claude Code's
own `/compact`, so the next turn resumes a short summary instead of re-writing a cold 200K-950K
token prefix. Because Claude Code records its system prompt once (`--system-prompt-snapshot on`)
and refreshes it only at a compaction, it is also how updated Haus instructions reach a
long-running session. A turn that arrives mid-compaction waits for it; the compaction is
journaled and counted in Usage as the Agent's own turn (specs/runtime-drivers.md "Idle
compaction"). A compaction keeps what the summary keeps: facts stated plainly and the current task
survive; details buried in bulk tool output or pasted filler may not, and the summary points the
Agent to the full transcript on disk to recover them.

The Server stores desired configuration and canonical history. Computer stores
effective runtime session state and resume evidence. The App reports that distinction
instead of inferring session health from process presence.

## What people see

A small ring sits under the composer of any conversation with a Captain: the DM's Agent, a
Channel's one Agent, or a Task's assigned Agent. It fills toward the session's compaction
threshold. Clicking it opens **Context**: tokens used over the threshold with a percentage, a
stacked bar, one row each for System prompt, Tools, Skills, Rules and memory, and Conversation,
and **Compact at** the threshold over the model's window. Agents keep one global session, so every
conversation with the same Captain shows the same numbers. An idle compaction updates the ring as
soon as it finishes, without waiting for the next turn. The ring hides until the current
session reports its first snapshot, and in a Channel with several Agents. How the runner counts
each row is in [specs/sessions.md](../../specs/sessions.md#context).


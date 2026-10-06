---
summary: Fresh-session instruction composition and persistent Agent context.
read_when:
  - changing generated Agent instructions
  - changing session resume, reset, model switching, or recovery
  - changing runtime launch config, Agent HOME setup, or what a runtime loads from disk (AGENTS.md, CLAUDE.md, settings)
---

# Context Management

Context management composes the instructions for an Agent's single global
model session. Per-turn message delivery is an inbox concern; see
[Agent Inbox](../../specs/inbox.md).

## Contract

- Computer composes managed product instructions, the Agent description, its
  private personality (when set, as a closing `## Personality` section), assigned skills, and tool guidance for every accepted turn. It persists the
  applied instruction and Harness bootstrap fingerprints with the resumed session.
- Computer does not append Haus-specific model-family steering. Every model receives the same
  managed product contract; executor-native instructions remain owned by that executor.
- Instructions include current time, home timezone, and the rule that old
  context and prior data reads must be rechecked.
- The model session spans every Chat the Agent participates in and resumes
  between deliveries and Computer restarts.
- Each turn reads the current MEMORY.md (hot memory plus a notes index) and only the additional
  notes needed for the task.
  Context compression also requires a recovery read. These are Agent instructions, not automatic
  file injection or a Computer-enforced freshness guarantee; the same global session still resumes.
- A MEMORY.md over 16 KiB earns a one-line private notice appended to the next turn input, at most
  once per 24 hours per Agent and only while still over. It names the `memory-hygiene` Manual
  topic. It is Computer-composed turn input, never an inbox item or standing-prompt text ([Agent Workspace](../../specs/workspace.md#durable-knowledge)).
- Explicit MCP requests use the fixed `execute` tool to discover and invoke currently granted
  Server tools. MCP grants and discovery results never change the harness tool catalog.
  Missing tools call for the specific connection or grant to be repaired; local configuration
  searches do not establish Server-owned MCP access. General capability selection still considers
  other authorized execution methods, and requested setup troubleshooting can inspect local state.
- Ordinary requests continue in the Chat or Thread where they were asked, from acknowledgment to
  result, following the human's lead across turns. Cloud Agent work Threads hold implementation
  details and revisions; the coordinating Agent brings a concise outcome and link back to the
  requester conversation. Questions to a person are @mentions where the work lives, and automation placement follows its own contract.
- Sessions never rotate because of age or idle time.
- The Harness supplies current composed instructions on every accepted turn. When the persisted
  instruction fingerprint differs, the same native conversation therefore adopts them without
  adapter rotation. Bootstrap drift or Restart parks the adapter at the turn boundary, applies the
  current content-addressed bootstrap, and resumes that conversation. Activity History records the
  update as started, completed, or failed without prompt text, local paths, commands, or hashes.
- Before Cove turns, Computer also reconciles recognized prior factory revisions of the playbook
  and FAQ. It never replaces Cove's memory, objectives, missing files, or edited guidance. A
  successful reconciliation gives the current session a one-turn private re-read notice; conflicts
  remain visible as failed instruction-update activity while the turn continues.
- Fingerprints advance only after the refreshed turn successfully detaches with new resume state.
  A bootstrap or turn failure keeps the previous receipt and session generation so a later delivery
  can retry. Only rejection of the stored native resume state enters Server-authorized session
  recovery; Computer never silently discards conversation context.
- The independently released Haus Agent version is the public receipt for this managed behavior,
  including instructions, actions, recipes and Manual content, Harness bootstrap, and factory
  guidance. Version drift uses the same next-turn refresh path. Computer marks the version current
  only after a successful turn, preserves the previous applied version on failure, and reports the
  pending/current/failed state to Server for the Agent profile. Exact fingerprints remain
  Computer-local implementation evidence.
- A fresh session starts only for initial creation, a runtime, model, or reasoning-effort switch,
  manual session reset, or one automatic recovery after the harness rejects a stored resume state.
- A rotation posts no message in any chat and draws nothing in the transcript. It is recorded
  durably and stamped on the Agent's messages (`sessionGeneration`).
- An execution-configuration change never interrupts an active turn. The active turn finishes
  with its frozen runtime, model, and reasoning effort; Server then rotates the session, applies
  the new configuration, and uses it for the next turn.
- A fresh session with pending work uses its notice or typed attention as the
  first prompt. `Start.` is used only when no delivery is pending. Later
  deliveries resume the same session without replaying that marker.
- Creating an Agent schedules no continuation for its creator and no bootstrap
  turn for the new Agent. The create receipt is returned in the same command, and
  the new Agent's first turn is its next ordinary delivery — by then its standing
  brief is already in the workspace memory the Computer seeded.
- Restart recreates the Agent runner and resumes the same native conversation.
  Its next delivery uses the same refresh path without rotating the session generation or
  replaying `Start.`.
- Session reset preserves workspace, memory, skills, identity, and Server
  history. Full reset restores an ordinary Agent's minimal `MEMORY.md`, empty `notes/`, and
  factory-managed skills.

The composed instructions are bounded by a size cap asserted in
`apps/computer/src/harness/managed-instructions.test.ts`. It is a ratchet that forces a deliberate
decision, not a hard or runtime limit: a justified addition raises the cap with a recorded reason,
and other prompt text is never cut just to make room. Raft-verbatim text is never trimmed. See
AGENTS.md and [the divergence register](../../specs/raft-alignment/prompt-divergences.md).

Durable Agent knowledge lives in the Agent-owned workspace (`MEMORY.md` and
notes), not an injected memory system. Agents read older canonical Chat history
through the `haus` CLI when inbox delivery is insufficient.

A model's context is the composed instructions, the workspace files the Agent
chooses to read, and its isolated `HOME` (skill links and runtime state). No
runtime auto-loads `AGENTS.md`, `CLAUDE.md`, or an equivalent from the
workspace, its ancestors, or the operator's home; the Agent reads `MEMORY.md`
itself, as the prompt directs. Computer enforces this per runtime:

| Runtime | Ambient instruction loading | Haus setting |
| --- | --- | --- |
| Claude Code | `project`/`local` settings (`CLAUDE.md`, `.claude/`) in the workspace and every ancestor | `settingSources: ['user']`; Agent `HOME` keeps its own `.claude.json`, never a link to the operator's (login resolves from host credentials) |
| Codex | `AGENTS.md` in the workspace and every directory up to its git root | `project_doc_max_bytes = 0` in `CODEX_CONFIG`; isolated `CODEX_HOME` |
| Pi | `AGENTS.md`/`CLAUDE.md` in the workspace and every ancestor to `/` | `noContextFiles` ([Dependency Patches](../operations/dependency-patches.md)) |
| Grok Build | Claude/Cursor files (`.claude/CLAUDE.md`, `.claude/rules/`, `~/.claude/`), plus generic names below | `GROK_{CLAUDE,CURSOR}_{AGENTS,RULES}_ENABLED=false`; isolated `GROK_HOME` |

Known gap: Grok Build 1.0.13 has no switch for generic `AGENTS.md`,
`CLAUDE.md`, `AGENT.md`, `CLAUDE.local.md`, or `.grok/rules/` in the workspace
and every directory up to its git root, and its binary cannot be patched. Outside a git repository
(the shipped `~/.haus/computer` layout) it reads only the workspace itself, so a
Grok Agent still sees such files it or a repository puts in its workspace. Haus instructions reach Grok through `$GROK_HOME/AGENTS.md`. The
`*-context-isolation*.test.ts` files under `apps/computer/src/harness/` prove
each row; the Grok live test fails when Grok changes this behavior.

Sub-agents run on Claude Code only, and only in the foreground:
`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` removes the Agent tool's `run_in_background`, so a
sub-agent finishes inside its parent turn. Codex launches with `agents.enabled = false` and
`features.multi_agent = false` in `CODEX_CONFIG`, and Grok Build with `GROK_SUBAGENTS=0`, so
neither offers a spawn tool.

The Server stores desired configuration and canonical history. Computer stores
effective harness state and resume evidence. The App reports that distinction
instead of inferring session health from process presence.

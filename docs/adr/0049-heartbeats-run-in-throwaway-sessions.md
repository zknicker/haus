---
status: proposed
summary: Agent heartbeats (bi-hourly daytime runs and the nightly dream) each run as one turn in a fresh throwaway harness session, serialized through the Agent's one run slot, reporting to the main session through the inbox. Amends ADR 0011 — one turn at a time still holds; one session per Agent no longer does.
read_when:
  - changing how heartbeat or dream runs open, resume, or settle a harness session
  - deciding whether an Agent turn may run outside its main session
  - adding parallel background execution for an Agent
---

# ADR 0049: Heartbeats run in throwaway sessions

## Status

Proposed, 2026-10-20. Amends [ADR 0011](0011-agents-own-one-global-session.md). Design in
[specs/heartbeat.md](../../specs/heartbeat.md).

## Context

Heartbeats give each Agent a bi-hourly daytime check-in and a nightly reflection
([specs/heartbeat.md](../../specs/heartbeat.md)). Running them in the Agent's main session would
wake a 600k–960k-token context whose one-hour cache has expired by every two-hour slot, costing
about 15× a bounded run (operator usage study, 2026-10-19). Codex heartbeats in the same thread
show the failure in the wild: one drained a month's quota in a day (openai/codex#45070).

ChatGPT Dots runs its Dreamer in a separate thread beside the parent conversation. Haus cannot
run two executions for one Agent today: Computer's work coordinator, launch host, proxy, notice
sink, and session lease are keyed per Agent, and the Server has one active-run slot per Agent.
The runtime driver rework (`specs/runtime-drivers.md`) keeps one session per Agent and background
tasks off.

## Decision

**A heartbeat is a turn in a fresh session.** Computer opens a new harness session for the Agent
(`<agentId>-hb-<runId>`, no resume), with the same instructions, identity, model, workspace, and
tools; runs one turn; never writes `session.json` or marks the main session interrupted; and
destroys the session when the turn settles. The main session is never resumed, parked, or
rotated by a heartbeat.

**One turn at a time still holds.** A heartbeat occupies the Agent's one active-run slot as a
chatless run, like today's dream. A daytime heartbeat is skipped when the Agent is busy, stopped
and stopped when a message addressed to the Agent arrives. People only ever talk to
the main session: a heartbeat posts nothing.

**Reports go through the inbox.** A heartbeat's one report becomes a chatless `heartbeat` inbox
item for the Agent; the main session decides what anyone hears. After any heartbeat, the main
session's next turn input names how many ran and where the latest checkpoint is.

**Daytime heartbeats do not edit MEMORY.md.** They suggest memory changes in their report; the
nightly run consolidates. This keeps memory race-free if heartbeats later run in parallel.

ADR 0011's "one agent owns one persistent harness session" now reads: one persistent main
session, plus throwaway heartbeat sessions that never carry conversation.

## Consequences

- An Agent shows as busy while a heartbeat runs; direct messages stop it.
- The main session learns a heartbeat's findings only through its report and the one-line note;
  details live in the checkpoint.
- `specs/sessions.md` ("one active session per agent", "a dream is the one chatless run") and
  `docs/internals/agent-daemon-delivery.md` change with the implementation.
- Parallel heartbeats remain possible later (background sub-agents or a second run slot) without
  changing the recipe, reports, or profile.

## Alternatives considered

- **Main session.** Simplest, but the cache rewrite makes every run expensive, and compaction
  would absorb the reflection.
- **Persistent heartbeat thread.** Grows like the main session and its cache also expires between
  slots; the checkpoint already carries continuity.
- **Parallel run now.** Matches Dots, but needs a second run slot on the Server and per-run state
  on Computer across at least six places. Deferred.
- **Background sub-agents.** The parent must take a turn to spawn one, so the schedule still wakes
  the main session; Claude-only at first; the finishing sub-agent starts a turn Haus did not
  schedule.

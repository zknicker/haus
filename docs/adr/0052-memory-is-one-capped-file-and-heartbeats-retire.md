---
summary: Decision to retire Agent heartbeats (daytime runs, the nightly dream, leads, checkpoints, report runs, dream records and their UI) and to make Agent memory one capped MEMORY.md that the Computer delivers in the turn input whenever it changed, instead of an instruction to re-read it. Supersedes ADR 0049.
read_when:
  - changing how an Agent's MEMORY.md reaches the session, its size cap, or the memory receipt
  - proposing any scheduled, unprompted Agent run, background reflection, or memory consolidation
  - reading the history behind heartbeats, dreams, leads, or `agent_dreams`
---

# ADR 0052: Memory Is One Capped File; Heartbeats Retire

## Status

Accepted 2026-11-18. Supersedes [ADR 0049](0049-heartbeats-run-in-throwaway-sessions.md) and the
heartbeat design in `specs/heartbeat.md`. ADR 0011's "one session per Agent" holds again: with no
heartbeat runs there are no throwaway sessions.

## Context

Heartbeats ran a fresh throwaway session every three hours in the day, and a nightly dream that
rewrote `MEMORY.md` and `notes/`. Around them grew leads, checkpoints, report runs, a stalled-queue
step, usage pauses, yield-on-address, dream records, a Server `agent_dreams` table, and a Dreams UI.
In use they added little the operator could feel, cost a run slot and tokens on a schedule, and
their dream diffs showed every member memory text the Agent learned in DMs.

The dream existed because `MEMORY.md` is free-form and the model owns it, so it drifts. A
competitor's shipped Agents (Capy Captains) keep memory without any background pass: they reread
their own notes file each time they wake, and the files live where people can read them.

## Decision

1. **Heartbeats retire completely.** No daytime runs, no nightly dream, no leads (`haus lead`),
   no checkpoints, no heartbeat reports or report runs, no `haus heartbeat` CLI family, no
   heartbeat Manual topics or memory-hygiene recipe, no dream records, no `agent_dreams` or dream
   summary storage, no Dreams section or dream rows in the App. A migration drops their tables.
   Connection keepalives that share the word (socket, attachment and telemetry heartbeats) are
   unrelated and stay.
2. **Memory is one file.** `MEMORY.md` at the workspace root is the Agent's memory. Everything
   else in the workspace, `notes/` included, is the Agent's to organize however it likes; Haus
   imposes no format beyond the existing guidance.
3. **The Computer delivers MEMORY.md; the Agent does not have to remember to read it.** At turn
   start the Computer reads `MEMORY.md` and puts it in the turn input when its content differs
   from what this session last received. A memory receipt (content digest) works like the
   instruction receipt: it advances only after a turn that carried the file or whose own edits
   produced the current content, and resets on a fresh session or a compacted turn, so the next
   turn carries the file again. An unchanged file adds nothing to the turn, which keeps the
   conversation and prompt cache from growing a copy per turn. A missing file delivers nothing.
4. **A hard cap keeps it small.** The Computer delivers at most 8,000 characters. A longer file is
   cut at a line boundary under the cap, with a notice in the same block naming the file's size
   and the cap and asking the Agent to tighten it. The cap replaces the dream's tidying job.
5. **The prompt teaches the cap, not a re-read ritual.** The managed prompt's memory section says
   MEMORY.md arrives in the turn input when it changed and must stay under the cap; the
   "re-read at natural boundaries and after compaction" instruction goes. This diverges from the
   Raft memory text and is recorded in the prompt divergence register.

## Consequences

- One run slot, one session per Agent; fewer scheduled tokens and no 03:00 activity rows.
- The DM leak through dream diffs closes with the dream itself.
- Nothing tidies memory in bulk. If MEMORY.md grows, the cap notice puts the work in front of the
  Agent during ordinary turns.
- Humans still cannot browse an Agent's memory without Owner/Admin workspace access; the planned
  Drive work moves MEMORY.md somewhere members can read and edit.

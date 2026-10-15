---
status: accepted
summary: Computers sync each run's redacted execution journal to the Server while it runs; the Server stores it for 30 days and every reader (App, coding agents, cloud agents) reads only Server records. The Server-to-Computer evidence relay is deleted. Supersedes ADR 0023's Computer-local evidence decision.
read_when:
  - changing execution journal sync, storage, retention, redaction, or reads
  - changing `agent.executionJournal`, `agent.executionOutlines`, or `agent.onExecutionJournal`
  - deciding whether the Server may request anything from a user's Computer
  - confirming a run's journal reached the Server, or backfilling journals after an upgrade
---

# ADR 0048: Execution journals sync to the Server

## Status

Accepted, 2026-10-15. Supersedes the Computer-local part of
[ADR 0023](0023-agent-work-projects-as-activity-and-chat-engagement.md): detailed execution
evidence is no longer stored only on the Computer, and it is no longer read through a live relay.
Amends [ADR 0019](0019-servers-own-collaboration-computers-own-execution.md): the Computer still
owns execution, and the Server now also holds a redacted copy of its evidence. The contract is
[Agent Activity](../../specs/agent-activity.md#computer-projection-and-execution-journal).

## Context

Owners and Admins read a run's journal and outlines through `agent.executionJournal` and
`agent.executionOutlines`. Before this decision, each read made the Server send a request to the
Agent's Computer and wait for the answer. That had three costs:

- **Trust boundary.** The Server sent queries to a user's machine on behalf of any authorized
  reader. Product owner Zach decided that the Server must not query a user's Computer at all.
- **Availability.** Evidence vanished whenever the Computer slept, updated, or went offline. The
  App needed `offline` and `timeout` states, and outlines needed reconnect-driven retries.
- **Readers.** Coding agents and cloud agents debugging a turn had to reach a live Computer
  instead of reading the Server.

Claude Code Remote Control and Copilot CLI session sync show the alternative: the machine that
executes pushes its record to the hosted service, and readers read only the hosted copy.

## Decision

**The Computer pushes, and the Server stores.** Every durable journal write leaves the Computer as
an `agent-execution-journal-records` frame on its attachment socket:

- Frames are at most 1 MiB and 2,000 records.
- Each record carries a per-run sequence that only grows.
- An `open` record replaces everything before it.

The Server takes these steps for each frame:

1. It checks that the Agent is assigned to the uploading Computer.
2. It stores the records idempotently in `agent_execution_journals` and
   `agent_execution_journal_records`.
3. It acks the frame's last sequence.
4. It announces `agent.onExecutionJournal`, throttled to one notice per second per run.

Reads replay the stored records with the same `@haus/api` reducer the Computer journals with.

**The relay is deleted.** The `agent-execution-journal-request` and
`agent-execution-outlines-request` commands and their results no longer exist. The Server never
asks a Computer for evidence. The hosted results narrow to `available` or `missing`, and the
attachment protocol moves to 32.

**Redaction happens before upload.** The Computer masks these before anything leaves:

- its known secret values
- token shapes
- credentials in headers, URLs and query strings
- secret-named keys, flags and assignments

It also relativizes workspace and home paths.

**The on-disk journal is the outbox.** Unacked frames resend after a reconnect. A settled run is
marked synced only after the Server answered every frame: stored, or refused for good. On every connect the Computer resends each
unmarked journal younger than 30 days, whole, newest first, one run at a time. That one mechanism
covers crash recovery and the one-time backfill of journals written before sync.

**Outlines ride the upload.** A settled run's outline is still computed by the Computer's
classifier and stored beside the run, so `agent.executionOutlines` is one Server read.

**The Server keeps a journal for 30 days** after its run started. An hourly sweep deletes older
runs. Semantic activity and turn summaries keep their own retention.

## Consequences

- **Detail survives the Computer going offline.** The App drops its offline and timeout states.
  A run that has not synced yet reads `missing` and is read again later.
- **This is a deliberate divergence from Raft,** which keeps detailed evidence on the machine.
- **Evidence now lives in Postgres.** Postgres holds redacted tool inputs, outputs and reasoning.
  Redaction is best effort beyond the known values, and access stays Owner/Admin only.
- **Older Computers show no detail until they update.** A protocol-31 Computer cannot attach as
  ordinary, so none of its runs have detail until it updates. After the update, its backfill
  uploads their journals.
- **Backfill costs bandwidth once.** A Computer with months of journals uploads up to 30 days of
  them on its first connect, paced by acks so live runs are not starved. Older journals stay
  local and are never uploaded.
- **Server and Computer ship together.** The attachment protocol matches exactly. A Server on
  protocol 32 keeps a protocol-31 Computer in update-required mode until it installs the
  protocol-32 release, and that release must be published for the Server to deploy
  (`computers/update.ts`). The upgraded Computer then backfills on its first ordinary connect.

## Rejected alternatives

- **Keep the relay and cache its answers on the Server.** Rejected because the Server would
  still query the Computer, and evidence would still be missing whenever the Computer was offline.
- **Upload once, when the run settles.** Rejected because live turns would still need a relay,
  and a long turn would arrive as one oversized frame.
- **Persist per-run sequence counters on the Computer.** Rejected because `open` records make
  replay order-independent of earlier uploads, and microsecond timestamps keep sequences growing
  across restarts without stored state.

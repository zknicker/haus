---
summary: State machine for Cloud Agent Runs — one transition table in `@haus/api`, Work as a projection of its newest Run, cancel intent on the Run, stalls as a typed Run condition, typed inbox notices, and failure boundaries that stop a notice from blocking an Agent.
read_when:
  - implementing any slice of the Cloud Agent Run state machine
  - changing how a Run or Work status is written, or adding a Run status or observation field
  - changing Cloud Agent cancel, stall reminders, or `cloud_agent_work` inbox attentions
  - deciding whether a Cloud Agent bug needs another guard or a new row in the transition table
  - changing how a rejected Agent start or an unrenderable inbox item affects delivery
---

# Cloud Agent Run Lifecycle

Status: implemented on `claude/run-lifecycle-slice-1`, 2026-11-06, not yet released. A human whose
message is set aside hears about it from the Agent; there is no App surface for it yet.

## Why

Cloud Agents broke repeatedly because Haus has a status vocabulary but no transition rules. The
rules live in guards added one incident at a time, across Computer, Server, and the inbox.

| Incident | What happened | The missing rule |
| --- | --- | --- |
| TECH-7, rounds 1 to 5 | A follow-up stalled, then a predecessor read `running` forever | What moves a Run, and who settles it |
| Stall notices | Non-terminal notices were bolted onto `errorCode` and a composite inbox id | What a stall is |
| Forge, 2026-11-05 | One `<runId>:stall:<window>` id failed readers that expected a run id, and every message to Forge queued behind it | What a notice is, and what it may block |
| `caw_UpsStTYuuqvDH17t` | Cancel was requested at 13:30 UTC. Its oldest Run settled 13 hours later, after four stall notices | Which Runs a cancel reaches |
| Release 17.5.0 | A one-minute Server and Computer gap paused Forge for an hour until a human wrote to it | What a version mismatch may do to delivery |

Three facts from production on 2026-11-05 shape the design:

- All 156 Works have the same status as their newest Run, so a Work status adds no information.
- All 15 Runs with an `error_code` are settled, so a stall can leave that field without losing data.
- `car_EpiLIZARTPLb3nFp` delivered four stall notices and a settle notice in the same turn.

## Who owns which state

| Layer | State | Role |
| --- | --- | --- |
| Provider | Its own run status | Truth about execution, read as evidence |
| Computer launch journal | `pending`, `launching`, `launched`, `cancelled`, `rejected` | Durable record of getting a prompt to the provider. Unchanged by this spec |
| Computer monitor | Which Runs it watches | Memory only. Anything needed after a restart comes from the reconcile ref or the journal |
| Server Run | `queued`, `running`, settled statuses | **The canonical state machine** |
| Server Work | Status, start, and terminal time | Projection of the newest Run |
| `job` | `working`, `done`, and so on | Read model for cards, derived from Runs |
| Inbox notice | `settled` or `stall` | Tells the delegating Agent about a Run |

## Decisions

### 1. One transition function owns Run status

`packages/haus-api/src/cloud-agent-run-lifecycle.ts` exports a pure function:

```ts
type RunReading = {
    status: CloudAgentStatus;
    observedAt: Date;
    stallCode: CloudAgentStallCode | null;
};

type RunStep =
    | { kind: 'ignored' }
    | {
          kind: 'recorded';
          status: CloudAgentStatus;
          settled: boolean;
          stall: CloudAgentStall | null;
          notice: CloudAgentNotice | null;
      };

function advanceCloudAgentRun(run: RunSnapshot, reading: RunReading): RunStep;
```

`applyCloudAgentObservation` becomes I/O around this function. `effectiveStatus` and the `settling`
and `stalled` branches move into it. The table is the contract:

| Run is | Reading | Result | Effect |
| --- | --- | --- | --- |
| any | Not newer than `observedAt` | Ignored | None |
| settled | Anything | Ignored | The first settled result stands |
| `queued` | `queued` | `queued` | Evidence, stall |
| `queued` | `running` | `running` | Evidence, stall, `startedAt` |
| `running` | `running` | `running` | Evidence, stall |
| `running` | `queued` | `running` | Evidence, stall. A Run never moves back |
| `queued` or `running` | Settled status | That status | `terminalAt`, `settled` notice |

Settled means `pending_input`, `completed`, `failed`, `cancelled`, or `expired`. `pending_input`
stays settled: its answer is a new Run. Adding a status means adding rows here, and the test walks
every status pair so a missing row fails.

A lint rule with valid and invalid cases rejects a literal `status` in an update of
`cloud_agent_runs` or `cloud_agent_work`, so writes come from the lifecycle functions.

### 2. Work is a projection of its newest Run

Work `status`, `startedAt`, and `terminalAt` always equal the newest Run's. One
`projectCloudAgentWork` function writes them, called when a Run is created or recorded. A reading
from an older Run changes no Work lifecycle field and only advances `updatedAt`, as it does today.
The columns stay because the active-work indexes use them.

### 3. Cancel intent lives on the Run and reaches every live Run

Today a cancel command names only the newest Run, so a predecessor is reached only by a later
reconnect. A follow-up also clears the Work's cancel fields, which drops the intent for any
predecessor still running.

`cancel_requested_at` and its requester columns move to `cloud_agent_runs`. A cancel marks every
live Run in the Work and sends one command for each. Follow-ups no longer clear anything, because
their Run has no request of its own. The Work's existing `cancelRequestedAt` and `cancelRequestedBy`
fields read from the newest Run, so the card and the wire shape do not change.

### 4. A stall is a typed condition on a live Run

```ts
type CloudAgentStall = {
    code: 'followup-auto-interrupt-failed' | 'claude-prompt-not-found';
    since: string;
};
```

A stall is neither a status nor an error. Observations carry `stallCode`, and Runs store
`stall_code` and `stall_since`. `error_code` becomes settled-only, enforced by a check constraint. This replaces
`isStalledErrorCode` and the literals that `@haus/api` and the Computer compare today. Each
observation states the stall, so a Run with no stall in its latest reading has none, and settling
always clears it. `since` is kept from the first reading of that code.

### 5. Inbox notices are typed records

A `cloud_agent_work` inbox row gains `cloud_agent_run_id`, with a composite foreign key to
`cloud_agent_runs` that cascades on delete, and `cloud_agent_notice` (`settled` or `stall`). A check
constraint requires both exactly when `source = 'cloud_agent_work'`. `dedupe_key` stays unique and
becomes opaque, so no code parses it.

- The frame's `cloudAgentWork` item carries `notice`. The Computer stops comparing ids.
- `cloudAgentAttentionRunId`, both `split_part` queries, and `retireOrphanedAttentions` are deleted.
  The foreign key makes an orphaned notice impossible.
- Reminders count two-hour windows from `stall.since`, not wall-clock buckets.
- Settling a Run deletes its queued `stall` notices in the same transaction, so the Agent reads one
  outcome. Served notices stay.
- No stall notice is raised for a Run with a cancel request, or for a settled Work.

### 6. A notice never blocks a conversation

An Agent's inbox holds human messages behind any notice, so each failure must stay as small as the
item that caused it.

- **Server:** when a dispatch fails, Server tries each queued item alone, sets aside the ones that
  cannot render, and dispatches again. A failure no single item explains
  stays a failure.
- **Computer:** a rejected start names the items it could not read in `rejectedItems` on its turn
  frame. Server sets those aside, clears the failure, and resends the rest at once, so one bad item
  never pauses the Agent.
- **Set-aside items:** a row settles `seen` with an `undelivered_reason`. It is not a new state,
  because a dozen readers treat anything unseen as live work. It never joins a later frame.
- **The Agent is told:** each set-aside row with a Chat gets one `delivery_problem` inbox item, for
  example `1 item wasn't delivered: cloud agent notice car_x, reason: <error>`. A human message's
  note names the message. It is an ordinary concrete item, so it wakes the Agent by itself and is
  delivered exactly once by its dedupe key. Server builds it from the row's source, id, and reason,
  never the item's content, so a note cannot fail the way the item did.
- **Version gaps:** a change to inbox item identity or frame shape bumps the Computer protocol, so
  an old Computer idles instead of rejecting starts. When a Computer attaches, Server clears any
  `start-rejected` pause on its Agents.
- **Rollout:** after a release that changes these frames, upgrade Computers as soon as
  `Publish Computer` passes, before `Promote Server` finishes.

## Invariants

Each one has a test in the slice that introduces it.

1. A settled Run never changes status.
2. A Run never returns to `queued`.
3. Work status, `startedAt`, and `terminalAt` equal the newest Run's.
4. `error_code` is set only on a settled Run. A stall is set only on a live Run.
5. A settled Run has exactly one `settled` notice while its requesting Chat lives, and no queued
   `stall` notice.
6. Every `cloud_agent_work` inbox row names a Run that exists.
7. A cancel request reaches every Run that was live when it was made.
8. A set-aside item does not stop any other item from reaching its Agent.
9. A set-aside item never joins another frame, and its Agent is told about it exactly once.

## Slices

Each slice ships alone, and behavior changes only where it says so.

1. **Transition table.** Add `advanceCloudAgentRun` and `projectCloudAgentWork`, route the
   observation and send paths through them, and add the lint rule. No behavior change. Until slice
   3, a reading carries `stalled: boolean` in place of `stall`. Proof: exhaustive table test and
   the existing Server stall tests.
2. **Cancel on the Run.** Migrate the columns and copy existing requests onto live Runs. Proof: a
   Work with a running predecessor and a queued follow-up cancels both without a reconnect.
3. **Stalls and notices.** Migrate the inbox and Run columns, backfill from `dedupe_key`, bump the
   protocol, and delete the parsers. Proof: a delivery test through the FakeTransport harness, not
   only a row assertion, and a backfill test using both id shapes.
4. **Failure boundaries.** Add per-item isolation, the Agent note, and version-gap pause clearing.
   Proof: a bad item beside a human message delivers the message and notes the bad item once, a
   lone bad item wakes the Agent with the note, and a Computer attaching lifts a `start-rejected`
   pause. The note also needs its `tune-agent-behavior` baseline.

## Out of scope

- A new status vocabulary. `queued` through `expired` and the `job` states stay.
- Changing the Computer launch journal, or the Claude and Cursor adapters beyond reporting `stall`.
- A generic state machine library. One table and one function cover one record.
- Turning Agent delivery (`agent_delivery`, wake pauses) into a similar table. Revisit it if it
  causes the same kind of incident.

---
read_when:
  - changing Agent delivery, attention, tasks, sessions, MCP, skills, workspace, or reminders
  - adding or reviewing live Agent end-to-end coverage
  - auditing Agent behavior after a cross-cutting architecture change
---

# Agent E2E

Agent E2E verifies Haus's user-visible Agent contract through the real App,
Server, Computer, and model. Research products can establish an expected
baseline, but scenario names and assertions describe only Haus behavior.

## Method

1. Establish the expected behavior through product research and record the
   prompt, model, transcript, timing, and screenshots.
2. Repeat the same business interaction in Haus through the real Haus App.
3. Record the Haus result before changing implementation.
4. Encode stable user-visible behavior as a `bun run test:agents` scenario.
5. Keep internal races, retries, bounds, and failure injection in deterministic
   Server or Computer tests.
6. Keep subjective model choices as observations rather than brittle gates.

Use GPT-5.6 Terra by default. Use GPT-5.6 Sol only when the scenario itself
requires materially stronger research, planning, or instruction following.

## Coverage classes

| Class | Proves | Rule |
| --- | --- | --- |
| Agent tests | A real message produces the promised Agent outcome across Server, Computer, and model. | Write a `test:agents` scenario: settle the turn, then assert structural Server state plus literal markers. |
| App E2E | Deterministic App navigation, cache, reconnect, and presentation behavior. | Use the isolated `test:app` Playwright stack and fake only the model boundary. |
| Deterministic | Durability, races, retries, authorization, bounds, and recovery invariants. | Use real product services and stores; fake only external boundaries, time, or failure. |
| Observation | Useful model judgment without a deterministic required outcome. | Record evidence; do not gate releases on one sample. |

## Scenario ledger

Coverage names the lane that owns the row. A row proven by the headless lane
names its scenario (`test:agents mention-wakes-only-addressed`); rows owned by
a deterministic or App lane keep that lane's name.

Status values:

- `mapped`: the behavior is identified but no executable lane owns it; the
  evidence is an observation.
- `baseline`: matched product observations are recorded.
- `passing`: Haus passed and the named executable lane is enabled.
- `quarantined`: Haus failed; the executable scenario records the gap but is
  not part of the green release lane.
- `opt-in`: the executable scenario is available, but requires real external
  runtime/provider setup and is excluded from the default green lane.

### Tranche 1 — Resident delivery and recovery

| ID | Haus behavior | Coverage | Status |
| --- | --- | --- | --- |
| D1 | Addressing an Agent wakes it and produces one reply in the addressed target. | `test:agents dm-single-concise-reply` + `test:tracer` | passing |
| D2 | One Agent drains work from multiple Chats without losing or conflating targets. | `test:agents multi-chat-drain` + deterministic serialization | passing |
| D3 | Work arriving during an active turn is noticed and handled at a safe boundary. | `test:agents mid-turn-freshness` + deterministic freshness | passing |
| D4 | Work queued while the Computer is offline is delivered once after reconnect. | Deterministic | passing |
| D5 | A transient Agent or Computer failure resumes pending work without duplicate output. | Deterministic | passing |
| D6 | Replayed or duplicate delivery does not create a duplicate Agent turn result. | Deterministic | passing |
| D7 | One Agent retains conversational context across different Chats. | `test:agents cross-chat-context` | passing |
| D8 | Restart resumes the same session and preserves context. | Deterministic session contract | passing |
| D9 | Start fresh session starts a new harness session while preserving canonical Chats, workspace, memory, and skills. | Deterministic reset contract | passing |
| D10 | Full reset clears context and restores an ordinary Agent workspace to minimal `MEMORY.md` plus factory-managed skills. | Deterministic reset contract | passing |
| D11 | Changing runtime/model applies exactly to the next delivery. | Deterministic configuration | passing |
| D12 | Stop holds new work and Start drains it without changing the session generation. | Deterministic delivery | passing |

### Tranche 2 — Inbox, attention, and response discretion

| ID | Haus behavior | Coverage | Status |
| --- | --- | --- | --- |
| A1 | A direct mention wakes the intended Agent and not another Agent. | `test:agents mention-wakes-only-addressed` | passing |
| A2 | An explicit no-response FYI in a Channel produces no Agent message. | `test:agents fyi-silence-channel` | passing |
| A3 | An explicit no-response FYI in a DM produces no Agent message. | `test:agents fyi-silence-dm` | passing |
| A4 | An ordinary DM receives one concise answer without routine narration. | `test:agents dm-single-concise-reply` | passing |
| A5 | Muting a Channel suppresses ordinary work while a direct mention still reaches the Agent. | `test:agents mute-on-request` + deterministic attention | passing |
| A6 | A Thread delivery is answered in that exact Thread rather than its parent Chat. | `test:agents thread-reply-stays-in-thread` | passing |
| A7 | Agent-authored handoff targets the intended Chat or member and wakes the recipient. | `test:agents peer-handoff` + deterministic authorization | passing |
| A8 | After an explicit Thread unfollow, a direct mention restores the follow and later ordinary Thread work is delivered again. | `test:agents thread-refollow-on-mention` + deterministic attention | passing |
| A9 | Solo multi-step work keeps at most an acknowledgment and the answer in the Channel and narrates progress in a Thread on the Agent's own acknowledgment; one-step work opens no Thread. | `test:agents solo-progress-threads-on-ack`, `test:agents task-conversation-routing` | mapped |

### Tranche 3 — Task ownership and work lifecycle

| ID | Haus behavior | Coverage | Status |
| --- | --- | --- | --- |
| T1 | Promoting a message creates one task with that message's Thread as its work surface. | App E2E + deterministic | passing |
| T2 | An Agent claims actionable work before acting and reports in the task Thread. | `test:agents task-thread-routing` | passing |
| T3 | Competing claims produce one owner; the loser stands down. | Deterministic race + prompt contract | passing |
| T4 | An Agent can acknowledge work, deliver the result, and advance the task state. Useful unsolicited progress is model judgment and remains an observation. | `test:agents task-clarify-then-deliver` + observation | passing |
| T5 | A task status update uses fresh Thread context rather than stale delivery context. | `test:agents mid-turn-freshness` + deterministic freshness | passing |
| T6 | Losing membership or task access prevents further reads and mutations. | Deterministic authorization | passing |

### Tranche 4 — Agent creation, onboarding, and retirement

| ID | Haus behavior | Coverage | Status |
| --- | --- | --- | --- |
| P1 | A new Server is Agent-free until an Owner explicitly provisions one. | Deterministic | passing |
| P2 | An Owner creates an Agent from reported Computer/runtime/model choices and can message it. | App E2E + `test:tracer` | passing |
| P3 | A new general-purpose Agent starts with its workspace, minimal memory, and factory-managed skills ready. | `test:agents workspace-survives-fresh-session` + deterministic workspace contract | passing |
| P4 | Invalid or unavailable runtime/model choices fail closed while offline desired configuration remains visible. | Deterministic configuration | passing |
| P5 | Deleting an Agent retires execution state and releases work while preserving collaboration history. | Deterministic cleanup | passing |

### Tranche 5 — MCP, skills, and workspace

| ID | Haus behavior | Coverage | Status |
| --- | --- | --- | --- |
| M1 | An Agent uses an assigned Server-owned MCP connection for appropriate work. | `test:agents mcp-granted-lookup` | passing |
| M2 | Revoking an MCP grant prevents later use and produces an honest access diagnosis. | `test:agents mcp-revoked-honest-failure` + deterministic authorization | passing |
| M3 | Importing a skill makes it available to that Agent on its next turn. | `test:agents skill-import-shapes-turn` + deterministic settlement | passing |
| M4 | An Agent creates a workspace file and can read it from a fresh model session. | `test:agents workspace-survives-fresh-session` | passing |
| M5 | A workspace artifact shared in Chat opens the correct Agent-owned file in the App. | `test:agents artifact-authoring` + App E2E | passing |
| M6 | Unavailable MCP connections, bounded skill traversal, and stale edits fail independently and safely. | Deterministic | mapped |

### Tranche 6 — Reminders and autonomous follow-up

| ID | Haus behavior | Coverage | Status |
| --- | --- | --- | --- |
| R1 | An Agent schedules a one-shot follow-up and later replies in the source Thread. | `test:agents reminder-schedule-and-fire` | passing |
| R2 | A natural-language future time schedules directly when it is unambiguous. | `test:agents reminder-schedule-and-fire` | passing |
| R3 | A follow-up checks the requested business condition rather than merely announcing that a timer fired. | Observation | mapped |
| R4 | A reminder firing while its Computer is offline is delivered once after reconnect. | Deterministic | passing |
| R5 | Schedule, snooze, update, cancel, and retry preserve one logical reminder. | Deterministic | passing |
| R6 | Cancel and fire races resolve to one authoritative lifecycle outcome. | Deterministic | passing |
| R7 | Only the owning Agent can manage or receive its reminder. | Deterministic authorization | passing |

### Tranche 7 — Multi-Agent coordination

| ID | Haus behavior | Coverage | Status |
| --- | --- | --- | --- |
| C1 | A coordinator divides independent work into owned lanes and synthesizes one recommendation from their evidence. | `test:agents coordinator-assigns-not-performs`, `test:agents coordinator-synthesizes-from-lanes` | passing |
| C2 | A verifier reviews the author's actual output before the coordinator presents the reviewed result. | `test:agents verifier-task-is-distinct` | passing |
| C3 | A time-bounded coordinator reports received and pending input honestly instead of waiting forever or treating silence as evidence. | `test:agents honest-cutoff-states-pending` | passing |
| C4 | A mid-flight human correction reaches active lanes and changes the final synthesis. | `test:agents correction-reaches-lanes-before-synthesis` + deterministic freshness | passing |
| C5 | A coordinator preserves contradictory owned evidence and asks the human to resolve a conflict instead of inventing a winner. | `test:agents conflict-preserved-for-human` | passing |
| C6 | A standing owner transfers a recurring lane with evidence and remains the backstop until the new owner proves one real delivery. | Observation | mapped |
| C7 | A coordinator publishes reviewed content only after the approved revision is recorded, and publishes it verbatim. | `test:agents publish-only-after-approval` | passing |

### Tranche 8 — Durable handoff

| ID | Haus behavior | Coverage | Status |
| --- | --- | --- | --- |
| H1 | A fresh Agent continues another Agent's sourced work from its durable Thread and shared artifact without the human restating the assignment. | `test:agents durable-thread-relay` + deterministic Thread identity | passing |

### Tranche 9 — Composed Agent creation

| ID | Haus behavior | Coverage | Status |
| --- | --- | --- | --- |
| P6 | Cove answers a natural Agent proposal in its parent DM without creating anything, then a separate creation request creates exactly one Agent inheriting Cove's runtime, model, reasoning effort, and Computer, announced by one `agent-created` Message in that same DM; repeating the request creates no second Agent. | `test:agents --include-opt-in --only cove-composes-agent-creation` + factory-playbook/Manual/tool contracts | opt-in |

## Existing executable lanes

- `bun run test:agents` is the executable home of this ledger. Scenarios live in
  `scripts/agent-tests/scenarios/` and drive real Server-to-Computer-to-model
  behavior headlessly through the hosted tRPC and Agent API contracts, against
  Agents created per scenario and retired after its verdict. See
  [Testing](../../docs/operations/testing.md#agent-tests).
- `bun run test:tracer` is the single full-stack Playwright spec: one mention
  typed into the real App composer reaches the Agent and its reply renders.
- `bun run eval:prompt` drives real Server-to-Computer-to-model behavior focused
  on the composed system prompt.
- `bun run eval:sessions` drives real session behavior through the same hosted
  contract.
- `bun run test:app` drives the real App against an isolated hosted Server,
  PostgreSQL, and Clerk stack. Computer inventory and Agent-authored effects are
  deterministic fixtures; it never calls a real model.

The executable browser-driven Agent specs were retired in favor of the headless
`test:agents` lane, which proves the same behavior faster and without UI
coupling; `test:tracer` retains the one browser proof that the wire works end to
end. The observations below remain historical records of what those runs saw and
are not maintained against the current lanes.

The Cove creation scenario is deliberately excluded from the default lane. Run
it only with `--include-opt-in` against a dev stack that has an active Cove,
healthy attached Computer reporting Terra, and
`HAUS_AGENT_E2E_AVATAR_FIXTURE=1` with absolute fixture and request-log paths. It writes
the normal transcript/report under `.context/agent-tests/<run>/` and performs
exact-id Agent cleanup through the shared crash ledger.

## Observations

- [2026-07-30 attention and cross-Chat delivery](./observations/2026-07-30-attention-and-delivery.md)
- [2026-07-31 delivery and recovery invariants](./observations/2026-07-31-delivery-and-recovery-invariants.md)
- [2026-07-30 attention routing and handoff](./observations/2026-07-30-attention-routing-and-handoff.md)
- [2026-07-30 task lifecycle](./observations/2026-07-30-task-lifecycle.md)
- [2026-07-30 Agent provisioning](./observations/2026-07-30-agent-provisioning.md)
- [2026-07-30 MCP, skills, and workspace](./observations/2026-07-30-mcp-skills-workspace.md)
- [2026-07-31 Agent artifact pane](./observations/2026-07-31-agent-artifact-pane.md)
- [2026-07-30 reminders and follow-up](./observations/2026-07-30-reminders-and-follow-up.md)
- [2026-08-02 durable relay](./observations/2026-08-02-durable-relay.md)

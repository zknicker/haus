---
summary: Haus Computer Agent daemon lifecycle, structured delivery, exact visibility proofs, crash recovery, and invariant tests.
read_when:
  - changing Computer Agent execution or AI SDK Harness session lifecycle
  - changing Server-to-Computer Agent delivery or busy notices
  - changing accepted, served, or seen semantics, or the retained delivery ledger
  - changing Agent-authored chain limits or turn failure retry policy
---

# Agent Daemon And Delivery

The product contract lives in
[Raft alignment](../../specs/raft-alignment/README.md),
[Agent Inbox](../../specs/inbox.md), and
[Sessions](../../specs/sessions.md). This document maps those principles to
the Server and Computer implementation.

## Ownership

- Server owns canonical Chats, messages, pending work, exact model visibility,
  verified contiguous seen boundaries, and the 16-turn Agent chain budget.
- Computer owns one isolated execution host per assigned Agent: workspace,
  HOME, skills, durable inbox acceptance, AI SDK Harness session state, and a
  resident loopback proxy.
- AI SDK Harness remains the execution implementation. A settled turn detaches
  its local session handle, parking the sandbox and resume state for the next
  delivery. Reset or retirement destroys that Agent host.
- Runtime discovery and launch share one exhaustive runtime-to-executable map. Detection proves
  the executable answers its version probe, not that a provider login or Agent turn will succeed.
- The Agent sees only the managed `haus` wrapper and its stable local proxy
  token. The Computer rotates the Server-valid runner credential for every
  turn and never exposes it to the Agent.

## Delivery State

```text
Server queued work
  -> full envelope in Computer-local pending inbox
  -> accepted ACK
  -> content-free notice (ordinary Chat work)
  -> Agent-chosen local message check (ordinary Chat work)
  -> concrete typed attention (Cove, committed action, fire, task assignment)
  -> exact visibility receipt where applicable
  -> settled proof
  -> Server exact seen evidence + consumption
```

Each queued row carries that lifecycle as durable state:
`queued -> accepted -> served -> seen`, stamped with `accepted_at`,
`served_at`, and `seen_at`. Attaching a row to a run makes it `accepted`; a
model pull makes it `served`, as does acceptance itself for a concrete row whose
body the run's own prompt already carries; settlement makes it `seen` and records the
consuming run in `settled_run_id`. Requeueing an unsettled run returns its rows
to `queued` and clears the accepted and served stamps.

Acceptance means only that Computer durably stored the run inbox. It is not
model-seen proof. An accepted run that loses its process before settlement is
replayed at least once. Duplicate effects are preferable to silently dropping
unseen human work. The committed-action exception is identity-addressed: the
Computer suppresses an action result already consumed by that accepted run, so
reconnect and delivery-ledger replay cannot show that terminal result twice.
If Server requeues an unsettled action into a new run, it explicitly reoffers the
action identity.

Settled exact visibility is the only consumption authority. A CLI pull serves Computer-local
bodies first, attaches exact identities to that run, and records those identities for
same-run freshness. Settlement marks exact pulled identities seen, including history messages
that never had pending rows, and
for concrete typed-attention or replay identities proven visible in that turn,
so already-handled work does not start a redundant turn. If the process crashes
first, the attached rows remain durable under the unsettled run and replay with
it. A failed turn advances `seen` only when a durable Agent send proves the
model handled that prompt.

## Delivery Ledger

Settlement retires rows into a ledger instead of deleting them: a settled row
becomes `state = 'seen'` with `settled_run_id` set to the consuming run. A turn
that read a message and answered nothing is only provable from a retained row,
so `agent_inbox` — the renamed `agent_pending_work`, holding every inbox item kind — is the
durable evidence behind `agent.deliveries`. Rows
the verified contiguous boundary subsumes are also marked `seen`, but no turn settled them, so
their `settled_run_id` stays null.

Retention must not slow the live path, so every dispatch, count, and queue read
gates on `state = 'queued'` with a null `run_id`, and run-scoped reads exclude
`seen`. Two partial indexes keep those reads as cheap as deletion did:
`agent_inbox_queued_idx` over `(server_id, agent_id, created_at)` where
the state is `queued`, and `agent_inbox_run_idx` over
`(agent_id, run_id)` where the state is not `seen`. Ledger history therefore
accumulates outside every index the live queue touches.

## Model Projection

Server sends structured inbox rows, never a preformatted model prompt.
Computer renders the exact target, short message id, home-timezone timestamp,
sender type, sender handle, optional sender description, and body defined by
the turn-shape spec. Server also preserves whether this Agent was personally
mentioned as immutable per-recipient attention metadata; delivery suppression and model
visibility do not infer from that flag.

Server also marks which inbox rows may be drained into the run's prompt:
`drainItemIds` on any start, `warmDrainItemIds` only when the harness session
resumes. Server cannot pick between them — it parks sessions between turns and
does not know whether the next `createSession` resumes or cold-starts — so the
Computer decides the lane from `isResume` and attests what it composed at
composition, before the model streams: it records the identities as local run
visibility, then posts a composed receipt (`POST /api/agent/events/visible` with
`composed: true`) that records exact Server visibility for the run without
serving the inbox rows, so a resend recomputes the same drain sets. The freshness
hold therefore never shows the Agent the message its prompt already carried. The
turn summary repeats the identities as the fallback for a refused receipt or a
crash, and settlement attaches the rows and advances `seen`. A resumed session drains every
eligible human body; a cold start drains only the addressed ones and notices the
rest in the same prompt (ADR 0034). Every start and notice frame also carries
`unreadElsewhere`, per-chat counts for work no row of that frame represents.

A start frame's first human row that @mentions the Agent in a Thread carries a
`threadContext` package when the Agent has no model-visible context for that
Thread in its current session generation — no verified boundary and no settled
exact visibility. The package names the parent and Thread targets and quotes
the parent message and up to ten earlier replies, bounded to 4,000 quoted
characters (Raft's `thread_join_context`). Drain selection reserves the
package's size whether or not visibility omits it, so a resend rebuilds the
same drain sets. The Computer renders it once per Thread target, before that
mention's envelope, in cold and warm drains and never in a notice, and attests
the quoted messages it showed whole alongside the drained bodies.

A fresh session uses its initial content-free notice as the first prompt;
`Start.` is used only when no delivery is pending. A reset recovery line
precedes whichever first prompt applies. A different notice arriving during
cold startup remains durable and is offered after that turn instead of racing
a mid-turn injection. Idle and busy Agents durably receive full envelopes but
project only target/count/id/sender metadata. Message bodies enter the model
only through explicit `haus message check`, history/hold context, a composed
start drain and its thread context package, or the typed non-Chat
system-attention lane. A committed action's concrete projection
includes its action identity, originating Chat, created Agent identity, and
executed result; its result is never exposed by the ordinary message-check path.

Busy notices queue behind the active turn and inject only after a completed
tool boundary with no other tool call still in flight, using AI SDK Harness's acknowledged
`experimental_steerTurn` API. The harness reports compaction only after it completes, so no
compaction gate exists.
Computer acknowledges only successful runtime acceptance, never a local queue write.
Every runtime steers. Claude Code and Pi do so natively. Grok Build and Codex run behind
`@ai-sdk/harness-acp`, whose Haus patch forwards the message as the agent's own steering request:
`_x.ai/interject` for Grok Build, and `_session/steering` for Codex, which runs as
[codex-acp](https://github.com/agentclientprotocol/codex-acp) over `codex app-server`
(`validateComputerBridgeAssets` refuses either bridge without its request). Codex accepts a
message only when codex-acp answers `injected`; a steer that reaches codex-acp after the turn
ended starts a turn Haus does not own, so the bridge cancels that turn and rejects the message.
If steering is unsupported, rejected, or no safe boundary remains, the durable notice stays
unacknowledged. Server wakes the same Agent session again after settlement. The composed system
prompt tells every Agent that a notice may arrive mid-turn; a runtime that cannot steer must
bring back a next-turn prompt variant before it joins the runtime table in
`apps/computer/src/harness/runtime-harness.ts`. The Agent can still pull its inbox during the active turn;
those exact visibility receipts prevent a redundant wake for already-read work.
Rejected steering also preserves the notice without changing the primary turn's
outcome. Unexpected failures while the SDK still has an active turn emit an
`inbox-notice-deferred` warning; already-ended turns need no warning.

Computer reconciles every model-visible message through one exact-identity
consume point. Accepted run inboxes and successful Agent API responses
(`events`, `history`, and freshness-hold context) remove their identities from
the local pending projection. Snapshot replacement and live notice injection
use the same serialized write boundary. Consumed identities remain attached for
the session generation because each notice carries only a bounded pending
window, preventing omitted or older in-flight rows from resurrecting a stale
notice. A session reset clears this projection. Local pulls also write
run-scoped visibility evidence: Computer attempts an immediate Server receipt
for freshness and repeats the identities in the turn summary. Server remains
canonical and advances `seen` only on settlement.

System attention that is not itself a Chat message, including Cove's one-shot
first-greeting request and a committed action terminal attention, uses the same
structured run inbox and exact-identity Computer replay. It is intentionally
absent from Chat cursor accounting. Cove's owning Server record prevents
recreation after settlement; a committed action's `(Server, action)` identity
does the same. The Computer suppresses a consumed action on same-run replay and
only reoffers it when a failed new run is explicitly materialized.

Task messages use the same exact inbox path as ordinary messages and carry their
canonical task number, state, priority, and assignee metadata. A mention may bypass a Channel mute
without unmuting it. A direct Thread mention restores an explicit unfollow; the recipient's pending
row persists the `threadFollowReactivated` effect so Computer can repeat the restoration notice and
exact unfollow command on replay without changing canonical Chat content. Muting or unfollowing purges already-queued
ambient work on that exact target while preserving personal mentions, assigned tasks, and reminder
wakes by their canonical domain relationships. Muting a parent Channel does not purge or suppress
ordinary work from its followed Threads.

An Agent-created peer assignment creates the canonical task message once, reserves
its single ownership slot for the peer, follows the deterministic task Thread
for that peer, and enqueues that exact task for the assigned Agent even when ambient Channel
delivery is muted. A separate assignee-only pending row, source `task_assignment` and keyed by the
assignment identity rather than by a message, points the Agent back to that canonical task and
carries the personal-attention signal without creating a second task or a Chat message. Neither
system needs a generic delivery-bypass flag.

## Long-Horizon Continuity

Computer maintains one resident execution host and one global model session
per assigned Agent. The session spans every Chat and does not rotate because
of age or idle time. A settled turn parks its harness state for the next
delivery; a Computer restart resumes that stored state.

On SIGTERM, SIGINT, or an update restart, the attachment daemon closes admission,
cancels active turns, and waits for their AI SDK streams to settle before calling
`session.stop()`. Parked sessions are reattached and stopped through the same SDK
contract. Computer saves each returned opaque resume state without rotating the
generation or discarding conversation context, then reaps all owned sandbox process
groups before exiting. Ordinary turn completion still uses `session.detach()`.

Shutdown allows 20 seconds for session checkpoints and accepted writers, then
forces process cleanup and reports a failure if state could not be saved. The
replacement daemon waits for the old PID to exit; a timeout blocks replacement.
Forced OS termination and power loss cannot perform this graceful checkpoint.

Initial creation, runtime or model switch, and manual session reset start a
fresh session. If the harness rejects stored resume state, Computer discards
only that state, advances the generation, and cold-starts once. The Agent then
recovers durable context from its unchanged `MEMORY.md`, notes, and canonical
Server history.

Session reset preserves workspace, skills, identity, and Server history. Full
reset restores the persisted Agent kind's factory workspace—minimal
`MEMORY.md` for ordinary Agents or Cove's exact onboarding seed—and only the
current factory-managed skills. Retirement is the only normal lifecycle
operation that removes the Agent execution host.

Human Restart is distinct from session reset. Server requires the assigned
Computer to be online, stops any active run, and sends an `agent-restart`
command before clearing the stopped flag and redriving pending work. Restart
therefore also resumes an Agent previously paused with Stop. Computer records that command durably,
recreates the runner boundary, resumes the same native conversation, and
uses the same fingerprinted instruction/bootstrap refresh path as automatic drift.

Before every accepted turn, Computer composes current instructions and fingerprints both them and
the selected Harness bootstrap. The AI SDK Harness supplies those instructions on each stream call,
so instruction-only drift keeps the adapter attached. Bootstrap drift or Restart parks the adapter,
applies the content-addressed bootstrap recipe, and resumes the same native conversation. Before a
Cove turn, Computer also replaces exact recognized prior playbook and FAQ revisions and privately
asks the same session to re-read them; edited or missing files are preserved and reported as a
conflict. The receipt advances only after the turn completes and returns valid resume state. Failure
or interruption remains stale and preserves the generation for retry. Only rejection of the stored native resume state is reported
as resume rejection, so only Server-authorized recovery may advance the session generation.

The release-owned Haus Agent version groups those managed behavior inputs into one public SemVer.
When it differs from the session receipt, the next accepted turn enters the same
`updating_instructions` lifecycle even when the lower-level fingerprints are unchanged. Success
stores the new version and application time; failure or a Cove factory-guidance conflict preserves
the old version and reports failed. Computer includes that receipt in effective state so Server and
the App can distinguish pending, current, and failed application.

Reminders are canonical Server schedules anchored to an Agent and Chat
target. When due, they enter the same delivery path as other work. Computer
executes the resulting turn; it does not own an independent reminder
scheduler.

Triggers are canonical Server inbound wakes anchored the same way. An
authenticated outside POST records a fire and enters the same delivery path,
carrying the bounded payload envelope as its pending-work content. Computer
projects that row as a `type=trigger` message from `@trigger`, its own sender
type alongside `human`, `agent`, and `system`. Computer executes the resulting
turn; it owns no inbound endpoint and no Trigger state.

Neither fire writes a Chat message, so a reminder or Trigger pending row is not
backed by one. Both ride the concrete lane already used by system attention that is
not itself a Chat message, keyed by fire identity: an idle Agent wakes with the
envelope in its first prompt and the row is served the moment the Computer accepts
that run, while a busy Agent still gets only the content-free notice and the item in
its next turn. Both envelopes end with
`reply with: haus message send --cause <fireId>`. That flag is the only way a
fire reaches the transcript: the Server validates the fire against the sending
Agent and records the provenance with the message. A fire the Agent does not
answer stays in the automation's fire history and nowhere else.

## Bounds And Failures

One Agent admits one turn at a time; different Agents run concurrently.
Sixteen consecutive drains containing only Agent-authored messages are
allowed. The seventeenth remains queued until human input arrives; any drain
containing human input resets the counter.

Authentication, invalid model/runtime configuration, and oversized input
failures degrade immediately because retrying cannot repair them. Rate limits,
timeouts, transport failures, and unknown failures use the bounded retry
policy. A human Restart clears the failure hold and redrives queued work without
rotating the Agent's session. Raw failure evidence remains Computer-local; the
compact failure kind crosses the Server boundary.

Computer validates committed action results with the shared Haus API schema.
A rejected start whose run, Agent, runtime, and model identities remain valid
reports a configuration failure immediately, without acknowledging delivery or
exposing the rejected payload. Server retains the inbox work for recovery instead
of leaving the run on Starting work.

## App Work Projection

Delivery state is durable; its live App projection is not. The Server emits three coarse lifecycle
phases from product boundaries:

| Phase | Projection point | App meaning |
| --- | --- | --- |
| `working` | A start command reaches the assigned Computer | Agent availability becomes busy |
| `reading` | The Computer accepts the run, or an Agent send finishes | Agent remains coarsely busy |
| `settled` | The active run completes, fails, or is stopped | Reconcile Agent availability, delivery state, and durable Activity |

Lifecycle remains the coarse availability projection. ADR 0023 adds a separate semantic Agent
activity journal: Computer maps known Harness and product boundaries into safe categories, Server
persists them, and the sidebar strip projects the latest category for each unsettled Agent. Unknown
and MCP tools remain generic. Neither lifecycle nor semantic activity carries arguments, command
contents, model reasoning, draft messages, tool outputs, or private file contents.
Instruction, Cove factory-guidance, or bootstrap drift adds an explicit `updating_instructions`
activity lifecycle. Its rows contain no prompt text, paths, commands, hashes, file contents, or raw
bootstrap errors.

Computer separately records a detailed execution journal keyed by run, including tool outputs,
tool errors, and model reasoning blocks. Owner/Admin inspection uses an authorized live relay;
Server never persists that response. Chat does not project run-attached
inbox work as typing. The `sending` composition bubble remains tied only to an explicit in-flight
message and its composition id.

## Invariant Tests

| Principle | Smallest proving lane |
| --- | --- |
| One persistent session; pending delivery or cold `Start.`, then resume | `apps/computer/src/harness/executor.test.ts` |
| Restart preserves generation and refreshes instructions exactly once | `apps/server/test/agent-delivery.test.ts`, `apps/computer/src/harness/executor.test.ts`, `apps/computer/src/harness/session-restart.test.ts` |
| Instruction, bridge, or Haus Agent version drift refreshes once in place and exposes the outcome safely | `apps/computer/src/harness/executor.test.ts`, `apps/computer/src/harness/bootstrap-refresh.test.ts`, `packages/haus-api/src/agent-activity.test.ts` |
| Known tools map through the semantic registry; unknown and MCP tools remain generic | `apps/computer/src/harness/executor.test.ts` |
| Runtime/model switch and rejected resume start exactly one fresh generation | `apps/computer/src/harness/executor.test.ts` |
| Session reset preserves workspace and skills; full reset restores the Agent-kind workspace and only factory-managed skills | `apps/computer/src/launch.test.ts` |
| Stable local proxy; per-turn Server authority rotates | `apps/computer/src/proxy.test.ts` |
| Exact message envelopes and content-free notices | `apps/computer/src/inbox-format.test.ts` |
| Session continuity picks the drain lane; a composed drain attests and consumes itself | `apps/computer/src/harness/turn-prompt.test.ts`, `apps/computer/src/harness/executor.test.ts` |
| A composed drain reaches the Server before the model streams and exempts its messages from the freshness hold | `apps/computer/src/harness/composed-drain-receipt.test.ts`, `apps/computer/src/visibility-receipt.test.ts`, `apps/server/test/agent-composed-drain-visibility.test.ts` |
| A Thread mention without visible context carries a bounded, budgeted package rendered once per Thread | `apps/server/test/agent-thread-context.test.ts`, `apps/computer/src/thread-context-format.test.ts` |
| Addressed drains, warm drain candidates, and the unread digest partition | `apps/server/test/agent-inbox-lanes.test.ts`, `apps/server/test/agent-inbox-digest.test.ts` |
| Every model-visible identity consumes one local notice contribution | `apps/computer/src/inbox-store.test.ts`, `apps/computer/src/proxy.test.ts` |
| Live notice injection cannot race accepted-run consumption | `apps/computer/src/inbox-store.test.ts`, `apps/computer/src/harness/executor.test.ts` |
| Pipe and redirected-file input reach the managed Agent CLI | `apps/computer/src/agent-cli/stdin.test.ts` |
| Durable accepted inbox; accepted crash replays | `apps/computer/src/delivery.test.ts`, `apps/computer/src/inbox-store.test.ts` |
| One concurrent turn per Agent | `apps/computer/src/delivery.test.ts` |
| Server resends accepted in-flight work after reconnect | `apps/server/test/agent-delivery.test.ts` |
| Busy pull settles with its active run; unsettled pull replays | `apps/server/test/agent-delivery.test.ts` |
| Exact exposure cannot consume without settled `seen` | `apps/server/test/agent-delivery.test.ts` |
| Settled and verified-boundary-subsumed rows are retained as `seen` ledger evidence | `apps/server/test/agent-delivery.test.ts` |
| `agent.turns` and `agent.deliveries` are member-scoped and deny as `NOT_FOUND` | `apps/server/test/haus-agent-observability.test.ts` |
| Chain ceiling preserves rows and human input releases it | `apps/server/src/agent-delivery/chain-budget.test.ts`, `apps/server/test/agent-delivery.test.ts` |
| Terminal vs retryable runtime failures | `apps/computer/src/runtime-failure.test.ts`, `apps/server/src/agent-delivery/failure-policy.test.ts` |
| Dispatch, acceptance, and settlement project semantic lifecycle phases | `apps/server/test/agent-delivery.test.ts` |
| `As Task` enters the inbox with canonical task metadata | `apps/server/test/haus-agent-run.test.ts`, `apps/computer/src/inbox-format.test.ts` |
| Fresh Agent Thread replies materialize the authorized anchor | `apps/server/test/haus-agent-run.test.ts` |
| Mute purges ordinary work without blocking personal mentions; a Thread mention restores an unfollow | `apps/server/test/haus-agent-run.test.ts` |
| Freshness validation and Agent send commit share one Server lock | `apps/server/test/haus-agent-run.test.ts` |
| Human and Agent claims share one ownership lock | `apps/server/test/haus-agent-run.test.ts` |
| Agent peer assignment is idempotent and delivers the exact canonical task identity to a muted peer | `apps/server/test/haus-agent-run.test.ts` |
| Agent retirement releases task ownership and emits durable updates | `apps/server/test/haus-agents.test.ts` |

These tests are protocol guards. Live Raft-versus-Haus behavioral scenarios
are a later product audit and do not replace them.

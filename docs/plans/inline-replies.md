---
summary: Accepted inline replies, scoped Agent attention, and background task coordination, with implementation and verification gates.
read_when:
  - implementing inline replies or changing Agent reply delivery
  - reviewing the conversation and task separation plan
---

# Inline replies and background work

Status: implemented and verified for Haus 4.1.0. The release checks below record current proof and retained failures. Fable review is recorded below.
Product changes require no new routing model or execution-session architecture.
## Outcome

A human asks in a channel, the Agent claims the request, acknowledges and answers inline, and
later replies to either the original request or its answers reach that Agent. Other channel
Agents receive new top-level conversation, but do not receive notifications for unrelated inline
reply chains. People can still mention an Agent without using Reply. Dedicated threads remain
available for conversations that benefit from a separate place.

## Behavior contract

1. A task retains one assignee and its canonical request message. Its work stays within that
   channel or DM and its existing child threads. No cross-channel task-message associations.
2. Claiming a request subscribes the claimant to its inline reply chain, atomically with the
   successful claim. Losing a claim does not subscribe the loser through that claim attempt.
3. An inline reply references a preceding message in the same exact chat and remains in that
   chat's transcript and sequence. Replying to a reply retains the same root. No new chat row,
   thread preview, or visible Exchange object is created.
4. An Agent author, successful claimant, or explicitly mentioned Agent participates in the
   chain. On send/claim, ensure root-author and root-mention subscription rows with insert-if-absent,
   then apply current participation, then select recipients. Inference preserves false rows;
   a successful claim, post, or direct mention sets true. This path is idempotent for old roots.
   Human visibility and unread behavior stay channel-based.
5. New top-level channel messages retain current channel delivery. Inline replies use chain
   subscribers plus direct mentions, excluding the sender. Membership, retirement, and access
   checks still apply. A mention identifies attention; it does not grant access or ownership.
   While a chain has never had an Agent subscription or explicit Agent
   address, human replies use ordinary channel delivery. Once participation has been established,
   an empty recipient set after unfollow/access loss stays empty unless explicitly addressed.
   A directed mention establishes participation before recipient selection, so it stays narrow.
6. Chain attention survives task completion and reconnect. An Agent can leave a chain. Posting
   or a direct mention restores its subscription; task completion does not change it. Like an
   explicitly followed thread, a chain subscription is independent of the
   ambient channel mute. Unfollowing suppresses ordinary chain delivery, not direct mentions.
   Unfollowing a chain the Agent never participated in is a no-op and writes no false row.
7. Reply links do not implicitly create, reopen, reassign, or finish tasks. Additional tool work
   requested by a later reply can be claimed on that reply message under the existing task
   lifecycle. Distinct requests in one chain can therefore have distinct single-owner tasks.
8. A standalone mention reaches the addressed Agent through existing delivery. The Agent can
   interpret the follow-up using its session; Haus does not automatically attach it to the
   latest task. Ambiguous requests can receive a clarification.
9. Explicit thread creation, thread follows, parent authorization, and existing thread links
   remain. Inline reply chains are initially for channel/DM messages; thread conversation keeps
   its existing follow semantics. The inline-reply API rejects parents in thread chats and the
   thread composer offers ordinary thread sends. Creating a thread is a separate action from Reply.
10. Cloud cards stay where launched and retain their automatic detail thread. Cloud completion
    remains a targeted wake to the coordinator. The requester gets the outcome in the original
    conversation. No nested cloud threads and no new cloud routing service.
11. Agent identity, one continuous global session, inbox pull, busy delivery, freshness checks,
    and atomic single-owner task claims remain unchanged. Agent-authored replies use the same
    existing chain budget and silence discretion as other Agent messages; joining a chain does
    not grant an unlimited agent-to-agent wake loop.

## Bounded technical shape

Server owns reply ancestry and Agent subscriptions. Messages need a nullable direct reply id
and a persisted root in the same chat, derived once on insertion. A small subscription relation keyed by
Server, chat, root message, and Agent records follow/unfollow. Derive the root on Server from
the referenced message; callers supply the direct reply, never an arbitrary root. Index ancestry
by chat and root; root messages use their own identity without a recursive history scan. No second
conversation object. Existing messages need no historical relationship inference.

Claims and sends update subscriptions in the same transaction as their durable records. Preserve
send nonce idempotency and unique subscription keys. A send accepted before a claim is serialized
under the old recipient set; the claimant must get the existing chain through a read, not a
synthetic replay of past notifications. Explicit mentions use canonical rich references.

API, CLI, inbox check/read/search, and native runtime inputs carry bounded reply context: direct
parent identity, root identity, and bounded root/parent excerpts alongside the new message. Fetch
missing ancestry on demand. Receiving or reading a reply must not mark intervening channel
messages seen. Existing per-chat freshness protection remains in force.

App Reply opens an inline composer reference; cancel clears it; send clears it after success.
The transcript reference navigates to the parent, including after pagination/reload. Existing
Reply in thread remains explicit. Human unread counts follow the ordinary channel sequence;
there is no second human subscription or unread system in this change. Cover desktop/web and
iOS contract decoding and interaction before enabling the feature across releases.

Intentional capability removal: retire the automatic successful completion
backstop, which infers completion from the run's last output anywhere in a task's channel.
Agents already have explicit task completion; make that authoritative. Keep settlement's
unfinished-claim tracking and failure visibility. Even chain-level inference is ambiguous when
one chain contains several tasks, and a cloud-launch acknowledgment is not a finished result.
This is a reviewed behavior change, not a test workaround; name it in the operator handoff.
A normally completed turn that leaves a claim open still surfaces it as unfinished/tracked,
as today. Do not hide forgotten open work to make a test pass. R1 and R5 require an explicit
done mutation; failure is a genuine behavior failure. Chat's task-label preference still applies.

Task lenses should reflect ownership/lifecycle rather than the choice of conversation location.
An assignee's thread reply alone no longer upgrades a background claim to
tracked. Inline replies likewise do not upgrade it. Preserve human-created tasks, Asks,
unfinished-run visibility, and status-based tracking.
Task detail links remain valid; showing the canonical request and its inline replies in task
inspection must not materialize an empty thread or count inline replies as thread replies.

## Implementation sequence and gates

### 1. Freeze the contract and record the baseline

Review this document with Fable for failure cases and scope. Resolve material disagreements in
a second exchange, recording accepted changes and remaining questions. Inspect the current dirty
diff and retain preparatory changes only where they fit this contract. Record current focused
Server, Computer, App, and Agent-scenario results before editing expected behavior.

Add a new ADR amending ADR 0013's retirement of inline replies and ADR 0015's task-work location
rules. Update specs/threads.md, specs/tasks.md, specs/inbox.md, and affected feature docs as their
implementations land. Preserve the global-session decision in ADR 0011.

Exit: approved behavior matrix, baseline failures separated from intentional expected changes,
and concrete API/storage shape. No prompt-only attempt to simulate missing relationships.

### 2. Deliver one working path through Server and Computer

Add checked-in PostgreSQL migration, API schemas, same-chat validation, subscriptions, recipient
planning, claim subscription, and CLI inline-reply support. Keep thread targeting distinct.
Support claiming a new request carried by an inline reply without re-claiming a completed root
task. Preserve claim race behavior. Add ancestry to reads and model-visible inputs.

Exit: deterministic tests prove exact inbox recipients, durability, no unrelated delivery,
no cross-chat references, no implicit thread creation, and explicit completion isolated to one
task through the full send/claim path. Check iOS additive contract decoding here.

### 3. Complete human interaction and task inspection

Implement Reply and its reference in the existing composer/transcript. Preserve explicit thread
navigation, task visibility preference, task inspection, unread counts, optimistic send/retry,
pagination, and reconnect. Coordinate iOS consumers. Simplify task lens coupling and fix only
the completion association necessary for this contract.

Exit: real browser test can send, follow, reload, and navigate inline replies while explicit
threads continue to work; supported clients preserve reply metadata and presentation.

### 4. Teach and evaluate natural Agent behavior

Review the final rendered prompt with Fable. Use short positive guidance in the existing format;
put CLI mechanics in the Manual. Explain keeping an exchange together, directed inline replies,
and the purpose of a separate thread. Preserve Raft-verbatim requirements through the reviewed
divergence process and fit Haus text within the existing prompt budget.

Run prompt-contract tests and eval:prompt. Run natural scenarios with ordinary user language,
without telling fixtures which routing calls to make. Reset fixture sessions before evaluating a
new prompt; keep sessions continuous within multi-request scenarios. Capture full trajectories.

Exit: structural tests green, user-visible flows proven, and three fresh trials per critical
behavior all pass. Report counts and failures; three passes are a smoke gate, not a reliability
estimate. A failure prompts diagnosis of delivery, context, or judgment before another edit.

## Acceptance matrix

| ID | Situation | Required observation | Proof |
| --- | --- | --- | --- |
| R1 | Human asks a basic tool-backed question; A claims | Inline acknowledgment/result; explicit done; task hidden; no child thread | Live Agent + browser |
| R2 | Human replies to their own original request | A gets one inbox item; unrelated B gets none | Server + live Agent |
| R3 | Human replies to A's answer or a later reply | Same root, same participants, one channel sequence | Server + browser |
| R4 | B is mentioned in the chain, then human replies again | B joins attention; A retains ownership; no duplicate exclusive work | Server + live Agent |
| R5 | Task completes; later human asks a related tool-backed question | A receives, claims, answers and explicitly completes new request without reopening root | Server + live Agent |
| R6 | Two unrelated roots have A/B owners in one channel | Reply delivery stays separate; a new top-level message retains channel delivery | Server |
| R7 | Agent leaves chain, channel mute, direct mention, retirement/access loss | Exact follow/mute policy; mention re-follows eligible Agent; access never broadened | Server |
| R8 | Concurrent claims/sends, retries, reconnect | One owner; subscriptions durable; nonce replay adds no duplicate message or delivery | Server + Computer |
| R9 | Cross-channel or invalid reply parent | Rejected before message, subscription, or inbox mutation | Server |
| R10 | Agent handles two requests in one turn | One answer cannot incorrectly complete both tasks | Server + live Agent |
| R11 | Human explicitly continues in a thread | Agent follows there; old thread links/follows still work | Existing thread scenarios |
| R12 | Natural complex request and ambiguous mentioned follow-up | Work can stay inline; Agent incorporates clear correction or clarifies ambiguity | Live Agent |
| R13 | Cloud review starts in channel or existing thread | Card/details correct; one targeted completion; result returns to requester location | Mock provider + real cloud smoke |
| R14 | Reply target off-page, failed send, reload/reconnect | Correct reference persists; no duplicate row; parent navigation loads history | Browser |
| R15 | Unrelated channel rows lie between received replies | Exact seen ledger; no invented read coverage; freshness guard remains correct | Computer + Server |
| R16 | Human replies before any Agent joins or claims | Never-subscribed fallback delivers through channel rules; later claim reads existing chain | Server + live Agent |
| R17 | Two Agents exchange inline messages | Existing loop budget applies; FYI/acknowledgment can settle silently | Server + live Agent |
| R18 | Cloud card is itself an inline reply | Card remains in parent chat; its detail thread anchors the card; no task-thread detour | Server + browser |
| R19 | Server/Computer/client versions differ | Additive reads decode; Server preserves narrow delivery; unsupported sends fail clearly | Contract + release smoke |

## Existing tests: preserve versus deliberately revise

- Preserve apps/server/test/haus-chat-threads.test.ts for explicit threads: deterministic
  creation, authorization, follows, cursor recovery, and preview counts. Add inline reply tests
  beside it rather than replacing thread expectations globally.
- Preserve apps/server/test/haus-tasks.test.ts and task-write-serialization.test.ts single-owner
  guarantees. Replace automatic-success cases in background-claim-settle.test.ts with explicit
  completion cases; retain failed/interrupted/unfinished-run coverage. Remove tasks/run-reply
  inference and its tests if no callers remain. Extend haus-task-stale-close.test.ts so a recent inline follow-up prevents a stale
  review from being closed merely because its dedicated thread was quiet.
- Deliberately revise the assignee-thread-reply promotion cases in haus-task-lenses.test.ts,
  background-claim-settle.test.ts, and tasks/task-tier.test.ts for the accepted lens change.
  Preserve unfinished work and human task visibility.
- Extend apps/server/test/agent-delivery.test.ts with a focused inline-recipient suite. Preserve
  global sessions, serialization, busy delivery, mentions, and channel mute behavior outside chains.
- The existing mention-wakes-only-addressed scenario asserts bystander silence, not absence of
  delivery or a model turn. Keep that behavioral assertion; prove scoped wake reduction using
  inbox rows and turn records, never silence alone. Top-level mentions retain channel semantics.
- Extend Computer inbox-format/input/store and CLI tests; revise output expectations only where
  reply context or explicit reply syntax changes. Keep negative seen-ledger assertions.
- Preserve task-thread-routing, thread-reply-stays-in-thread, thread-refollow-on-mention, and
  durable-thread-relay: these explicitly request threads. Add an inline sibling scenario.
- Extend task-conversation-routing and conversation-natural-followups with inline relationships.
  Preserve their explicit human-thread branch. Tighten cloud-conversation-handoff to assert card
  location and request-correlated completion, not merely some parent-channel output.
- Extend apps/website/e2e/tests/messaging.spec.ts and tasks.spec.ts, plus relevant thread/cloud
  specs. Split Reply and Reply in thread selectors instead of changing all old thread assertions.

Gate the completed diff through docs/operations/testing.md Change Routing: API/consumer
typechecks, Server/Computer/website gates, focused browser flows, prompt contract and eval:prompt,
scoped live Agent trials, iOS checks when changed, and final autoreview. Run shared affected
scenario suites once after the completed implementation. Record pre-existing failures separately.

## Scope and release

No central semantic router, cross-channel task links, new Exchange UI, per-task Agent sessions,
group-DM/temporary-channel feature, thread removal, or generic workflow engine. Reuse existing
delivery and authorization machinery. Preserve old messages and threads as-is. Additive storage
ships before clients emit inline replies; validate the supported Server/Computer/App release set.
No new per-channel all-Computers version gate. Under version skew, never silently strip a supplied
reply reference and accept the send as a broadcast. Server recipient planning remains authoritative
even if an older Computer cannot use the new ancestry context; document that behavioral limit.

Messages are immutable in the current product: no edit/delete or tombstone feature is added.
Invalid or missing parents are rejected; existing chat-clear semantics must preserve relational
consistency and remove reply subscriptions together with their deleted history.

Ship only after evidence demonstrates both correct delivery and natural behavior. No deployment
or production data changes are authorized by this planning step.

## Fable review, 2026-09-16

Reviewed through three exchanges with `claude-fable-5-1`. Final verdict: internally consistent
and implementation-ready as a proposal, subject to operator acceptance of three named decisions:
the never-participated orphan fallback, explicit task completion replacing inferred success,
and task tiers independent of reply location. These extend the previously agreed behavior.

Accepted: persist reply roots, preserve explicit unfollows, make initialization idempotent,
cover pre-claim replies and Agent loops, test cloud cards that are inline replies, preserve
version-skew delivery semantics, and distinguish silent bystanders from Agents never woken.
Rejected: shared-root completion inference, hiding normally settled open claims, inventing
message deletion/tombstones, and blanket committing or shelving the existing dirty work.

Cloud work deliberately outlives the launch turn: its claim remains tracked and in progress
until the coordinator handles completion. R13 expects pending work at launch, then explicit
completion after the result; it does not apply R1's same-turn completion requirement. Existing
cloud card state supplies the explanation; no new pending-work UI is required by this plan.

Planning verification: docs:list discovers this document, all 19 acceptance rows are present,
and diff whitespace checks pass. Product tests have not been rerun in this planning step;
baseline collection and implementation verification are explicit gates above.


## Implementation verification, 2026-09-16

Server delivery and lifecycle regressions, Computer and shared API suites, Website unit checks,
iOS tests/build, workspace typechecks, lint, and prompt contracts passed. Browser proof covers
inline send/retry/reload, older parent navigation, task inspection, and existing task/thread flows.
One task-promotion browser failure did not reproduce in the diagnostic or clean combined rerun;
no speculative cache change was made.

Live verification now runs against the worktree stack through Varlock. Initial fixture failures
were setup failures; occasional missing-session provisioning still invokes the runner's repair.

The first live pass exposed an inadequate oracle: channel placement alone allowed unlinked
answers and acknowledgments. `conversation-natural-followups` now checks every response's
root ancestry as well as the human-created thread and quiet parent channel. A fresh worker
subsequently chose a task thread for a simple calculation. Fable reviewed a bounded Sending
messages refinement that ties replies to where the incoming request arrived; the prompt guard
and protected text remain unchanged. This observed drift remains part of the evidence.

- Final wording: natural basic question, complex planning, human-created thread, and completed
  request follow-up all passed in `.context/agent-tests/20260916T192524/summary.json`.
  The follow-up addresses the original human message without a mention, reaches its owner,
  leaves the unrelated Agent without a delivery, and explicitly completes the new task.
- Intermediate wording: natural conversation passed twice; the separate inline-follow-up
  scenario passed once and failed once. Reports: `20260916T191546` and `20260916T191905`.
- Real cloud smoke passed in `.context/agent-tests/20260916T190917/summary.json`: launch in
  the requesting channel, actual provider completion, coordinator wake, and outcome with link.
  The recorded transcript also confirms acknowledgment and outcome ancestry to the request.
  This cloud run preceded the final wording refinement.
- Fresh deterministic checks passed: 22 Server reply/lifecycle tests, 17 harness tests,
  prompt contract, and lint. Earlier package and browser proof above remains applicable.

One fresh pass on final wording is behavior evidence, not the planned three-trial reliability
gate. `eval:prompt` passed 5/6 in `.context/agent-tests/20260916T193057/summary.json`:
silence in channel and DM, addressed mention, multi-chat drain, and injection resistance passed.
The concise DM turn produced one durable message but none in the requesting DM. Its original
report did not preserve the other destination or execution journal, so the scenario now retains
full routing evidence for diagnosis. At that checkpoint this blocked release pending diagnosis and repeat
proof; a passing focused channel run could not override it. The follow-up below records the
subsequent diagnosis and full-suite result.

Two fresh diagnostic DM repeats passed (`20260916T193526`, `20260916T193648`), without a
further prompt change. The first captured reply explicitly links the incoming request. The
original wrong-destination failure was not reproduced, so its cause remains unconfirmed.
Focused review of the verification changes preserved all behavior assertions and added evidence
capture; no new code-review findings. Do not treat these repeats as a clean full-suite result.

### DM deep dive follow-up

With no prompt or routing changes, seven additional fresh DM trials passed. Six isolated runs
(`20260916T200338`, `200504`, `200532`, `200600`, `200626`, `200701`) were followed by the
original `eval:prompt` suite, which passed **6/6** in
`.context/agent-tests/20260916T200820/summary.json`. All seven captured DM transcripts contain
exactly one Agent answer in the requesting DM, with the correct request-root reply reference.
Their execution journals show explicit inline sends rather than thread targets.

The original DM failure did not reproduce. These runs provide a clean current suite result,
but do not establish the cause of that earlier failure or prove it fixed. Retain its report and
the richer failure capture; no speculative prompt or routing change was made. Axiom was not
connected in this session; evidence came from local journals and canonical Server records.

### Release verification, September 17

The full `bun run check` passed through the approved operator environment, including production
builds. Its first attempt passed tests but the build hit a 1Password authorization timeout; the
entire gate was rerun. Focused browser checks passed 3/3. Swift host tests passed 82 XCTest and
12 Swift Testing cases. The release workflow owns the native archive and publication proof.

Final-prompt basic channel answers, complex planning, and human-thread revisions passed in
`20260916T192524`, `20260917T154812`, and `20260917T155147`. Post-completion replies to the
original human request passed in `20260916T192524`, `20260917T155147`, and `20260917T155519`,
including owner delivery, unrelated-Agent silence, reply ancestry, and explicit task completion.
These meet the three-trial smoke gate for the central placement and follow-up behaviors. The
real cloud run above remains the provider proof and predates the final wording refinement.

Retained failures: `20260917T154124` overlapped a source merge and Computer restart, invalidating
that clean-trial assumption. `20260917T154413` routed correctly but the budget oracle rejected
$500+$100+$200 because it required literal 800. The oracle now accepts that exact allocation
without changing routing assertions. A later launch failed before execution on the same
1Password timeout. No prompt or routing changes were made for these results. The original DM
failure remains unexplained despite the clean full-suite result and seven passing repeats.

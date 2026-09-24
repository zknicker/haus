---
summary: A wake that resumes a live session drains human bodies, a cold start drains the messages addressed to this Agent, and every wake reports the unread work it does not carry.
read_when:
  - changing which inbox bodies enter a run's prompt, or the cold/warm drain lanes
  - changing what a wake tells an Agent about work in other chats
  - changing how the Computer attests bodies it composed itself
  - adding a signal that needs to know an item was addressed to one Agent
---

# ADR 0034: Addressed messages ride the wake

## Status

Accepted, 2026-09-22. Amends the I2 carve-outs in
[Raft alignment](../../specs/raft-alignment/README.md) and the delivery-planning
contract in [the Agent inbox](../../specs/inbox.md). ADR 0026's inbox lane,
ADR 0030's routing gate, and the cause-inference rule are unchanged.

## Context

Haus pushed no bodies into an ordinary wake. Every human message reached the
model as a content-free notice, and the Agent decided whether to pull. That was
read as Raft parity, and it was not: Raft's daemon drains full envelopes into an
alive-idle session and only falls back to a notice when the Agent is busy. Haus
Agents therefore woke less informed than their Raft equivalents, and a direct
question could sit behind a pull the Agent chose not to make.

Two more gaps followed from the same shape. A concrete wake — a reminder or
Trigger fire, a task assignment, a settled Cloud Agent Run — zeroed
`totalPending`, so an Agent woken by a fire was told nothing about the human work
waiting for it. And Raft's per-wake digest of unread counts in other channels had
been retired during WS4 as "nothing pushed", leaving an Agent with no cheap way
to know that other conversations were waiting.

Cold versus warm is not a fact the Server holds. Haus parks the harness session
between turns, and whether the next `createSession` resumes or cold-starts is
known only inside the Computer, after the session exists. Anything the Server
decided about liveness would be a guess racing the process it describes.

## Decision

**The Server decides eligibility; the Computer decides the lane.** The start
frame carries `drainItemIds` — drainable on any start — and `warmDrainItemIds`,
drainable only when the harness session resumes. The Computer reads `isResume`
and composes accordingly: a resumed session drains every eligible human body,
matching Raft's alive-idle wake; a cold start drains only the addressed items and
puts a content-free notice for everything else in the same prompt, which is
Raft's hybrid shape. A busy Agent's mid-turn traffic stays content-free without
exception. Existing drain budgets — fifty rows and 24,000 characters — apply
unchanged, and a human drain never shares a run with a fire, so ADR 0026's
sole-fire cause inference is untouched.

**An item is addressed when it names this Agent.** A DM, a personal @mention, or
a Jev routing that committed the message to exactly this Agent at the 0.90 gate
(ADR 0030). Stale, invalid, uncertain, timed-out and broadcast judgments are not
addressing. The reason is decided once, when delivery is planned, and persisted
on the inbox row as `addressed_reason`. Draining an addressed message on a cold
start is a Haus extension beyond Raft, taken because Haus Agents sleep between
turns far more often than Raft's do.

**The Computer attests what it composed, at composition.** A notice-lane drain
is not served by the Server, so the Computer records those exact identities as
run visibility, posts them to the Server as a composed receipt before the model
streams, and consumes them from its local notice projection. The composed
receipt records exact visibility for the run and nothing else: the inbox rows
stay offered, so a resend still recomputes the same drain sets, and settlement
attaches them and advances `seen` through the existing turn-summary path. The
turn summary is the fallback — a refused receipt or a crash before settlement
still attests, or replays, the same identities.

**Every wake reports the work it does not carry.** Each start and notice frame
carries `unreadElsewhere`, per-chat counts rendered as Raft's own wording. The
partition is asymmetric on purpose: a chat with a notice row in this frame states
its own pending count and is excluded outright, while a drained item represents
only itself, so work queued past the drain budget in an already-drained chat
still surfaces as a count. Concrete wakes stop zeroing `totalPending` for the
same reason. Counts advance nothing.

## Consequences

An Agent woken while its session is alive now reads its messages instead of being
told they exist, which is the behavior the prompt has always described. A cold
Agent answers the question it was asked and still exercises pull discretion over
the ambient channel traffic around it. No Agent is left unaware of pending work
in a chat this frame could not carry.

`addressed_reason` also makes "was this item aimed at me?" queryable without
reparsing the per-message routing audit, which is what a future typing or
engagement signal (the surface ADR 0023 rejected) would need.

Visibility has to reach the Server before the model can reply. The freshness
hold on `haus message send` treats any peer message newer than `seen` that was
not served to this run as news; a drained wake message attested only at
settlement read as news, so every warm turn's first reply to it was held once
behind a `--send-draft` round trip. The composed receipt closes that window, and
the hold itself is unchanged.

The costs are real. `isResume` is a proxy for Raft's ALIVE-IDLE: a session
resumed after the Computer restarted reads as warm, and a session rotation forces
a cold start that downgrades an intended warm drain to addressed-only. A resend
must recompute the same drain sets from durable state or a replayed run composes
a prompt the ledger does not expect; `startFrame` does, and a test holds it. And
because the 1.5-second Jev deadline makes `uncertain` and `timeout` the common
non-narrow outcomes, most channel traffic stays unaddressed — the safe default.

## Rejected alternatives

**A Server-side liveness report.** The Computer could report whether each Agent
holds a live session and let the Server pick the lane. It adds a protocol surface
whose answer is stale the moment a session parks, and it races the very
`createSession` call it tries to describe.

**Joining `chat_messages.delivery_routing` at plan time.** Planning runs inside
the transaction holding the Server row lock, where every extra read is sequential
by construction. The audit is also per message, not per recipient: a narrow that
went stale is not addressed for anyone, and reconstructing that per Agent at plan
time is strictly more work than writing one column at enqueue.

**Inferring addressing on the Computer from `mentioned`.** The frame already
carries the mention flag, so the Computer could decide for itself. It would miss
DMs, which carry no mention, and Jev narrows, which exist only in Server state.

**Always delivering human bodies concretely.** Simplest of all, and it destroys
pull discretion: an Agent in busy channels would wake with every ambient message
in its prompt, which is the flooding the notice lane exists to prevent.

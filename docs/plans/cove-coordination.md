---
summary: Cove's recipe-grounded hiring and opt-in ongoing coordination contract.
read_when:
  - changing Cove guidance, Agent creation prerequisites, or recurring team reviews
---

# Cove coordination

Cove remains the onboarding partner and continues as the owner's chief of staff.
He routes work, checks agreed workstreams, tracks decisions and handoffs, and
suggests improvements backed by current task and conversation evidence.

## Implementation plan

1. Before a new Agent-owned creation, require successful full Manual reads in
   the creating run: `agent`, `recipes/decision/one-or-many`, and at least one
   published archetype. Require a standing brief. Search results and summaries
   do not count. Keep archetypes as advice, without a new stored Agent type.
   Replays return the existing Agent before this prerequisite is checked.
2. Teach contextual selection, adaptation, review ownership, first work, and
   real scheduling. A cadence in a brief is not an installed reminder.
3. Extend Cove's refreshable playbook with continuing coordination. Reviews
   are opt-in, bounded to agreed accessible Chats, and quiet unless evidence
   changes or a decision is needed. Store scope, offer state, reminder id,
   pending decisions, open handoffs, and the last raised evidence per open
   finding in Cove's own `notes/coordination.md`, indexed by MEMORY.md. Consent
   and exact schedule input stay only while a schedule is in flight. The note is
   current state rewritten in place, not a ledger: delivered message ids,
   settled send attempts, per-run results and resolved findings are dropped,
   while owner-declined suggestions stay so they are not raised again;
   history stays in Haus chats. Never overwrite learned memory.
4. Expose the reminder API's existing command id in the CLI. Persist an exact
   absolute first fire time and command id before scheduling; retry identical
   input, list and reconcile the current reminder after restart, update/snooze
   existing reminders for corrections, and cancel on opt-out. No new scheduler.
5. Test real isolated API lookups and creation, reminder replay/cancellation,
   factory upgrades and custom-file preservation, and model-facing scenarios
   for contextual recipe selection and quiet reviews.

## Boundaries

Creation prerequisites record successful Server-side full-topic resolution in the
current run; they do not prove client receipt or comprehension.
Selecting a relevant archetype and adapting a useful brief remain model judgment
and require behavior tests. Owner-created Agents use their existing App path.
The chief-of-staff role does not grant private Chat access or external tools.
Never infer poor effectiveness from silence alone. Treat recommendations as
proposals; do not edit teammates, grant access, or create schedules without
the relevant human agreement. Keep pending decisions in notes and contextual
mentions; do not restore Asks, Needs you, Wiki, or extraction.

Existing recognized factory playbook/FAQ revisions upgrade idempotently. Custom
guidance remains untouched and is reported through the existing conflict notice.
An upgrade never creates a reminder or treats earlier onboarding consent as
consent to continuing monitoring.

## Weekly review offer and upgrades

After useful work scope is established, offer one optional weekly review with
a suitable owner-facing answer. Existing Coves use their next suitable
interaction; no migration wake or scheduler is added. Preserve any agreed
cadence, historical opt-out and custom guidance. Record offered intent before
sending and pending after confirmed delivery in the existing coordination note.
Enabled, declined and postponed states survive restart and suppress repeated
offers. Reconcile uncertain sends against original Chat history; if delivery
cannot be proved, wait for the owner. Notes do not provide exactly-once delivery.

The normal Agent Workspace suite includes upgrade fixtures for d031 factory
notes, the outgoing local daily-review guidance, the shipped 9.0 ledger-style
playbook, all five offer states,
learned memory/objective preservation, and custom or missing factory files.
The Computer suite includes opt-in native model regressions:
`HAUS_RUN_COVE_WEEKLY_TEST=1 VARLOCK_ENV=test varlock run -- bun test apps/computer/src/harness/cove-weekly-offer.live.test.mjs`.
Run `cove-weekly-agreements.live.test.mjs` with the same flag for custom guidance,
actual no/later responses and preservation of an agreed daily cadence. Without
the flag both files skip model calls. They exercise controlled turns against
temporary real Haus APIs, not a full Computer daemon or a live Server.

Default Quality CI includes the Agent Workspace upgrade tests through
`test:fast`. Computer executor regressions run in `test:computer`, part of the
explicit heavy check rather than default Quality CI. Native model scenarios
remain opt-in even during that heavy check; they do not automatically validate
every future prompt change. Rerun them when modifying Cove's offer/recovery
guidance, and report behavioral misses alongside passing deterministic gates.

## Behavior evidence and runtime correction

An exploratory model run skipped the playbook and installed no Cove follow-up;
a later review acknowledged an already declined arrangement. Fresh MEMORY.md
pointers alone did not reliably load operating guidance. Every Cove turn now
carries a private context notice through the existing executor notice path,
asking it to read current operating notes before acting. Warm turns receive it
too. Generic Agent instructions also clarify conditional reminder reporting and
single-result acknowledgments; the reviewed full prompt remains below its
33,910-character cap on the current-main integration.
This is a stronger delivery path, not a guarantee of model compliance.

A repeat hiring run exhausted its four-minute test budget after three generic
reminder refusals. The CLI had passed zoned or ambiguous timestamps through to
an API that accepts UTC timestamps. Schedule/update now normalize explicit
zones to UTC and reject ambiguous/impossible dates locally with a useful error.
Stable command ids still identify identical canonical schedule input.

A real scheduler wake still produced an unchanged watch report despite a quiet
brief. The shared reminder prompt unconditionally demanded an answer to every
fire. It now requires a provenance-marked top-level answer by default, with an exception for explicitly agreed quiet checks. This preserves
one-shot delivery and answer provenance. A targeted native wake
regression replays the previously observed baseline to test this exact conflict.

A consented one-step scheduling request also exposed an extra preliminary
acknowledgment before the confirmed result. The Haus Tasks guidance now treats
one confirmed result as the acknowledgment for short schedule confirmations, corrections and opt-outs, honors
requests for one reply, and applies unattended reporting agreements. The original
Raft communication-style text remains intact. Native acceptance cases require
exactly one delivered confirmation; the unchanged-watch wake requires zero.
Neither a prompt assertion nor one model sample establishes universal compliance.

The preserved original experiment stays on d031dd7e; the release candidate first integrated onto
5b00c901b12af9b9ac1b68e129da4a5c5dfce8ee, then rebased onto main
8044e052c40990be278203d58ee3921e96e0726e for landing. This preserves main’s
0061/0062 migrations, wake pause and unread inbox contracts, protocol 27 and
Raft v1.21.2-source.1 pin. The new additive migration is 0063. Newer main commit
`131ce58636133bf845ecafcd2da044a11259f6e8` introduces reminder titles that are
one line and at most 60 characters, descriptions at most 300 characters, and
migration 0060. The release candidate adapts guidance to that title/description contract, preserves
pre-0060 fingerprints on replay, and returns current reminder state with an
explicit replay marker. Migration regressions pass on the candidate. The pre-rebase full-daemon prompt eval passed all 10 scenarios on the reviewed 33,101-character managed prompt. Landing validation passed all 10 scenarios against the combined 33,910-character prompt. Current and old d031 CLI native hiring passed; explicit timezone and normal/refresh quiet scheduler wakes passed. The integration review also hardened mutation envelopes against unsupported keys, returned 401 for invalid credentials, exposed validation paths, and corrected recovery guidance for durable held wakes. Earlier provider-capacity and externally terminated runs were incomplete; they are not counted as passes. Native fixtures require a real finish receipt and reject errors/aborts. Calendar scenarios align the injected timezone with canonical Server state and verify subsequent fires across DST; the agreed per-reminder IANA timezone is stored independently of Agent home timezone. A prompt-only mismatch guard failed a real model check, so calendar CLI schedules now require an explicit --timezone and refuse before mutation on unsupported older Servers. Existing requests and stored fingerprints without timezone retain their original behavior.

A resumed weekly-offer test held the human message already present in its prompt.
The controlled fixture had omitted Computer's pre-stream composed-message
visibility receipt; production already attests that exact body. The fixture now
sets valid accepted-run metadata and posts the real composed receipt before
streaming. Its resumed turn injects genuinely new human input before sending,
requires the resulting hold to expose that input, and still requires a delivered
answer before continuing uncertain-offer reconciliation. CLI hold feedback now
distinguishes a saved draft from a delivered answer and permits silence only
when no reply is needed or a delivered reply supersedes it. It does not bypass
freshness checks, retry automatically, or force unattended checks to report.

## Adversarial release review

Fresh Agent-owned creation uses a required brief contract; the Server's explicit
legacy request decoder permits old nonce replay and gives old fresh requests an
actionable refusal. Manual attempts retain typed lookup/miss metadata; additive migration 0063
records the canonical resolved topic separately after full-topic validation.
Only those successful read receipts satisfy the creation gate. Historical rows
are preserved and do not implicitly authorize a new hire.
The private Cove notice has an independent 2,300-character budget (raised by 300 to preserve timezone and single-confirmation guards) and shares
consent, silence and no-advertising guards across regular, refresh and conflict
paths. Full protocol details stay in the playbook and Manual.

Proven held/refused non-delivery may retry an offer once at a suitable interaction;
unknown network delivery must be reconciled rather than retried blindly. Factory
refresh rechecks each outgoing inode immediately before replacement and preserves
concurrent in-place edits. External atomic replacement in the final rename window
has no filesystem compare-and-swap guarantee; refresh normally runs between
serialized Agent turns, and custom or missing files are preserved on detection.

`cove-reminder-wake.live.test.mjs` adds opt-in real Server scheduler/start/ack and
settlement with Computer's prompt composer. It checks one-shot top-level provenance
and silent review even during guidance refresh. The weekly fixture also uses the
production prompt composer and real composed-message visibility receipts. It
controls native turn execution and does not replace the full-daemon prompt eval.

Old Computer clients remain subject to the Server creation gate. Its actionable refusal must survive old CLI rendering; no capability bypass is introduced. New Computer guidance is delivered on owner-triggered Computer updates, so publish Server and Computer together and explain the update requirement. Existing customized guidance and learned notes remain owned by their Agents.

Ordinary Agents use the same strict creation gate. Their standing prompt points to the full agent card; a later creation run that skips fresh full reads pays one actionable 409 before recovery. This is intentional rather than granting a capability bypass. Native patrol hiring verifies reachability of the gate under explicit owner instructions, not unconstrained contextual recipe selection. The Manual resync stays in this changeset because correct discovery and follow-up recipe semantics are part of the requested Cove behavior; capture fidelity is separately pinned.

Production steering sends a notice with the current activeRunId (`agent-delivery/delivery.ts`, planDispatch); fresh drains mint a new run id. Session resume restores harness history, not old Server read authorization. Each new creation run must obtain current-run full reads. The outgoing weekly guidance hash recognizes the locally tested d031 experiment revision (unreleased), preserved as an upgrade fixture; it is not attributed to a public release. Refresh/conflict notices replace the regular Cove notice, so a turn receives one such protocol notice.

The explicit timezone correction received a focused Opus follow-up. Its two P2 findings were fixed: capability discovery now uses an authenticated endpoint that reads no historical reminder rows, and calendar cadence updates require explicit confirmation of the reminder’s stored zone. A different zone requires a newly consented replacement. The CLI validates receipt timezone before printing success. Initial fire and repeat cadence remain independent, as before; agreement model tests separately verify the first local time and the later DST recurrence.

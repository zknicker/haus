---
read_when:
  - reviewing the Agent E2E reminder and autonomous follow-up baseline
---

# Reminders and follow-up — 2026-07-30

The comparison baseline was the tranche 6 audit (removed 2026-11-27). It used ordinary business requests
with GPT-5.6 Terra and separated scheduling from the later business result.

Stable user-visible gates are:

- an unambiguous natural-language time schedules without clarification;
- the schedule is acknowledged in the source Thread without keeping the model
  turn alive;
- one later fire wakes the owning Agent in that Thread;
- the Agent reads current Thread state and reports the requested business
  outcome rather than merely announcing that a timer fired.

Exact receipt copy, emoji, internal reminder records, script selection, and
precise firing seconds are not parity gates.

The live Haus exercise scheduled a one-shot check, emitted one canonical fire
receipt, reread a `READY` status added after scheduling, and produced the fresh
status in the requested Agent follow-up. It also exposed extra script-output
chatter after the Agent chose a script that invoked an unavailable `haus`
command. The ordinary model wake still produced the correct follow-up; the
script error remains a product observation rather than evidence of multiple
logical fires.

The executable scenario now changes the business status after scheduling and
requires the later Agent result to contain that fresh status nonce. This avoids
a false pass where an Agent repeats stale reminder payload.

The Server transcript was correct, but the already-open Thread did not render
the schedule receipt, fire receipt, or later Agent result without a refresh.
R1–R3 remain quarantined on this App invalidation gap.

Focused deterministic coverage proves:

- overdue ordinary and script reminders replay once after reconnect;
- schedule, update, snooze, cancel, and script execution are idempotent;
- cancel/fire and concurrent mutation races have one authoritative outcome;
- another Agent cannot list, inspect, mutate, or receive the owner's reminder.

Verification:

```text
bun test test/haus-reminders.test.ts \
  test/haus-reminder-scheduler.test.ts \
  test/haus-reminder-api.test.ts \
  test/haus-reminder-lock-order.test.ts
32 passed

bun test src/agent-cli/commands/agent-reminder.test.ts \
  src/reminder-script.test.ts
6 passed

HAUS_DEV_STACK_ID=agent-e2e bun run eval:agents -- \
  reminder-followup.spec.ts
1 expected failure (Thread realtime invalidation)
```

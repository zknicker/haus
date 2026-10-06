// Haus fires a Reminder on the Server in one transaction: the fire row, the
// wake, and the next fire time land together, so Raft's daemon-side
// fire-request retry budget and its log line do not exist here. Each row swaps
// one captured Raft line for its Haus semantics; the rest of the card stays
// verbatim. The register row in specs/raft-alignment/prompt-divergences.md owns it.
export const reminderSemantics = new Map<string, ReadonlyArray<readonly [string, string]>>([
    [
        'recipes/pattern/recurring-recovery',
        [
            [
                "- **Fire-request exhausted (silent, `next` stuck in the past)**: the daemon reaches the slot and starts the fire, but its fire request to the server exhausts its bounded retry budget; the daemon logs that once and keeps reconciling quietly. Nothing wakes you, `haus reminder log` shows no FIRED row for that slot, and `next` stays in the past even though the agent is running. Where you can read your computer's daemon log, the line is `delivery retry exhausted at fire_request` (about 20 minutes after the slot in the observed cases); search it by the reminder id, the line does not carry the agent id. Counter: re-anchor with `snooze --by <duration>` (or `update`) instead of waiting; a re-anchored recurring reminder fires normally at its next slot. This is a different shape from fire-without-run: there the log has a FIRED row and `next` advanced, here it has neither.",
                '- **Fire that never happened (silent, `next` stuck in the past)**: the Server records a fire, queues your wake, and advances `next` in one step, so a fire it cannot complete leaves nothing behind. Nothing wakes you, `haus reminder log --id <id>` shows no row for that slot, and `haus reminder list` still shows the reminder `[scheduled]` with a fire time in the past even though the agent is running. The Server retries every tick, so a past fire time that persists means the reminder cannot fire where it is anchored: its channel or thread was archived or deleted, or every fire attempt fails. Counter: re-anchor instead of waiting: `snooze --by <duration>` (or `update`) when the anchor is still live; otherwise schedule it again on a live message and cancel the stuck one. A re-anchored recurring reminder fires normally at its next slot. This is a different shape from fire-without-run: there the log has a row and `next` advanced, here it has neither.',
            ],
            // Raft's observation; Haus has not observed this shape.
            [
                ' The exhausted shape was found the same way: three recurring reminders on two agents had no FIRED row for their slots and `next` in the past; re-anchored with `snooze`, all three fired at the next slot.',
                '',
            ],
        ],
    ],
]);

import type { TriggerKind } from '@haus/api';
import { parseReminderRepeat } from '../reminders/cadence.ts';

const weekdayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
] as const;

/**
 * The one-line cadence a provenance mark shows for a Reminder: "Every Monday at
 * 09:00", "Every 2 hours", "One time". The stored spec is the machine grammar;
 * this is the only place it becomes prose.
 */
export function reminderCadenceSummary(repeat: string | null): string {
    if (!repeat) {
        return 'One time';
    }
    const parsed = parseReminderRepeat(repeat);
    if (!parsed) {
        return repeat;
    }
    if (parsed.kind === 'daily') {
        return `Every day at ${clock(parsed.hour, parsed.minute)}`;
    }
    if (parsed.kind === 'weekly') {
        const days = parsed.days.map((day) => weekdayNames[day] ?? '').filter(Boolean);
        return `Every ${days.join(', ')} at ${clock(parsed.hour, parsed.minute)}`;
    }
    return `Every ${intervalPhrase(parsed.intervalMs)}`;
}

/** The kind label a Trigger provenance mark shows. */
export function triggerKindSummary(kind: TriggerKind): string {
    return kind === 'webhook' ? 'Webhook' : 'GitHub';
}

function clock(hour: number, minute: number): string {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function intervalPhrase(intervalMs: number): string {
    const units = [
        { ms: 86_400_000, name: 'day' },
        { ms: 3_600_000, name: 'hour' },
        { ms: 60_000, name: 'minute' },
    ];
    for (const unit of units) {
        if (intervalMs % unit.ms === 0) {
            const amount = intervalMs / unit.ms;
            return amount === 1 ? unit.name : `${amount} ${unit.name}s`;
        }
    }
    return `${Math.round(intervalMs / 60_000)} minutes`;
}

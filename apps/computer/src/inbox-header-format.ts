/**
 * The header facts every inbox line prints — the `msg=` short id and the
 * `time=` wall clock — shared by envelopes, notices, and thread context lines.
 */

/** A timestamp as the Agent's home-timezone wall clock, `YYYY-MM-DD HH:MM:SS`. */
export function formatInboxTime(timestamp: string, homeTimezone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        second: '2-digit',
        timeZone: homeTimezone,
        year: 'numeric',
    }).formatToParts(new Date(timestamp));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`;
}

/**
 * An id that addresses no Chat message: a Trigger fire (`trf_…`), a Reminder
 * fire (`rmf_…`), or a Cloud Agent Run (`car_…`). None of them can be read,
 * threaded on, reacted to, or handed to `--message-id`. Each carries the id
 * that does work on its own envelope line instead — a fire's `fire=<id>` and
 * `--cause <fireId>`, a Run's `work=` and `run=`.
 */
function isBodilessInboxId(id: string): boolean {
    return /^(?:car|rmf|trf)_/u.test(id);
}

/**
 * The `msg=` short id every inbox surface prints, for messages and for the
 * bodiless items alike. A compound assignment key
 * (`task-assign:<messageId>:<version>`) shortens to the task message it hands
 * over, which is the id the Agent can actually address — reading it, threading
 * on it, or reacting to it. A fire has no such message, so it prints `-`
 * rather than an id the Agent would spend a failed command on.
 */
export function shortInboxId(id: string): string {
    if (isBodilessInboxId(id)) {
        return '-';
    }
    const assignment = /^task-assign:(?<messageId>[^:]+):/u.exec(id);
    const subject = assignment?.groups?.messageId ?? id;
    return subject.replace(/^[a-z]+_/u, '').slice(0, 8) || '-';
}

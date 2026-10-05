import type { Reminder, ReminderHistoryEntry } from '@haus/api';

/**
 * The section is a schedule, so it renders only the wakes still coming. The
 * Server sorts every row by `fireAt` ascending, which puts long-settled rows
 * above the next wake; filtering here keeps that order meaningful without
 * resorting it.
 *
 * What has already happened is not a settled reminder but an execution, and it
 * lives in the History drawer, which reads `reminder.history` instead.
 */
export function scheduledReminders(reminders: readonly Reminder[]): Reminder[] {
    return reminders.filter((reminder) => reminder.status === 'scheduled');
}

/**
 * The row's second line: what the short title stands for. A Reminder written
 * before the split copied its title here, so an identical one is said once.
 */
export function reminderDescription(reminder: Pick<Reminder, 'description' | 'title'>) {
    const description = reminder.description?.trim();
    return description && description !== reminder.title.trim() ? description : null;
}

export function formatReminderTime(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

/** The one scheduled-row line: the next wake, and the cadence when it repeats. */
export function formatReminderSchedule(reminder: Pick<Reminder, 'fireAt' | 'repeat'>) {
    const fireAt = formatReminderTime(reminder.fireAt);
    return reminder.repeat ? `${fireAt} · ${reminder.repeat}` : fireAt;
}

/**
 * A one-shot has a cadence too — it is "Once". Leaving the cell blank would
 * read as missing data in a column every other row fills.
 */
export function formatReminderCadence(repeat: string | null) {
    return repeat ?? 'Once';
}

/** What one execution produced, as the History drawer's outcome cell renders it. */
export type ReminderExecutionOutcome =
    | { color: 'danger' | 'default' | 'success'; kind: 'script'; label: string }
    | { kind: 'note'; label: string }
    | null;

/**
 * An execution says one thing about itself, not two. A reminder that carried a
 * script reports the script; that is the outcome the operator came for, and the
 * answer is already stated by the Answer column's link. A reminder without a
 * script has only its answer to report, so it stays blank when the link says
 * "Open" and names the silence when there is no link to say it.
 *
 * Silence is a real ending rather than a pending one: a fire the Agent had
 * nothing to add to leaves the conversation untouched and is never revisited,
 * so this reads "No answer" rather than "Awaiting answer".
 */
export function reminderExecutionOutcome(
    entry: Pick<ReminderHistoryEntry, 'answer' | 'script'>
): ReminderExecutionOutcome {
    if (entry.script) {
        return { ...scriptOutcome(entry.script), kind: 'script' };
    }
    return entry.answer ? null : { kind: 'note', label: 'No answer' };
}

/**
 * A script's exit is a genuine success or failure, unlike a reminder's own
 * settled status, so it takes the semantic colors. A missing exit code is
 * neither: the Computer recorded the wake but never reported how the script
 * ended.
 */
function scriptOutcome(script: NonNullable<ReminderHistoryEntry['script']>) {
    if (script.timedOut) {
        return { color: 'danger' as const, label: 'Timed out' };
    }
    if (script.exitCode === null) {
        return { color: 'default' as const, label: 'Not reported' };
    }
    return script.exitCode === 0
        ? { color: 'success' as const, label: 'Exit 0' }
        : { color: 'danger' as const, label: `Exit ${script.exitCode}` };
}

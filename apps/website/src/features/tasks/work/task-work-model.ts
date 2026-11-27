import type { PullRequestReading, PullRequestState, TaskReminderRef } from '@haus/api';

export const pullRequestCheckLabels = {
    failing: 'Checks failing',
    none: 'No checks',
    passing: 'Checks passing',
    pending: 'Checks running',
    unknown: 'Checks unknown',
} as const;

const reviewLabels = {
    approved: 'Approved',
    'changes-requested': 'Changes requested',
    none: 'No review',
    unknown: 'Review unknown',
} as const;

export const pullRequestStateChip: Record<
    PullRequestState,
    { color: 'accent' | 'default' | 'success'; label: string }
> = {
    closed: { color: 'default', label: 'Closed' },
    draft: { color: 'default', label: 'Draft' },
    merged: { color: 'success', label: 'Merged' },
    open: { color: 'accent', label: 'Open' },
};

export function pullRequestFacts(reading: PullRequestReading): string {
    const files = `${reading.changedFiles} ${reading.changedFiles === 1 ? 'file' : 'files'}`;
    return `${pullRequestCheckLabels[reading.checks]} · ${reviewLabels[reading.review]} · ${files}`;
}

export function pendingTaskReminders(
    reminders: readonly TaskReminderRef[]
): (TaskReminderRef & { nextFireAt: string })[] {
    return reminders
        .filter(
            (reminder): reminder is TaskReminderRef & { nextFireAt: string } =>
                reminder.kind === 'once' && reminder.nextFireAt !== null
        )
        .sort((a, b) => Date.parse(a.nextFireAt) - Date.parse(b.nextFireAt));
}

export function reminderLine(
    agentName: string,
    nextFireAt: string,
    now: Date = new Date()
): string {
    const at = new Date(nextFireAt);
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
        at
    );
    const sameDay = at.toDateString() === now.toDateString();
    const when = sameDay
        ? time
        : `${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(at)} ${time}`;
    return `${agentName} checks back at ${when}`;
}

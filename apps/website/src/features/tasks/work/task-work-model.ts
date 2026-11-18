import type {
    CloudAgentPullRequestReading,
    CloudAgentPullRequestState,
    CloudAgentWork,
    TaskReminderRef,
} from '@haus/api';

const checkLabels = {
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
    CloudAgentPullRequestState,
    { color: 'accent' | 'default' | 'success'; label: string }
> = {
    closed: { color: 'default', label: 'Closed' },
    draft: { color: 'default', label: 'Draft' },
    merged: { color: 'success', label: 'Merged' },
    open: { color: 'accent', label: 'Open' },
};

/** "Checks passing · Approved · 4 files": the reading's facts on one line. */
export function pullRequestFacts(reading: CloudAgentPullRequestReading): string {
    const files = `${reading.changedFiles} ${reading.changedFiles === 1 ? 'file' : 'files'}`;
    return `${checkLabels[reading.checks]} · ${reviewLabels[reading.review]} · ${files}`;
}

/**
 * The attached pull requests no Cloud Agent card already shows: a work card
 * carries its own pull request line, so the panel says each pull request once.
 */
export function standalonePullRequests(
    works: readonly Pick<CloudAgentWork, 'pullRequest'>[],
    pullRequests: readonly CloudAgentPullRequestReading[]
): CloudAgentPullRequestReading[] {
    const shown = new Set(
        works.flatMap((work) => (work.pullRequest ? [work.pullRequest.url] : []))
    );
    return pullRequests.filter((reading) => !shown.has(reading.url));
}

/** The Task's pending one-time reminders, soonest first (ADR 0052 decision 16). */
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

/**
 * "Forge checks back at 7:35": who checks back and when, in the reader's
 * clock. A fire on another day names the day too.
 */
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

import type { AgentIssueAssignment, AgentIssueEvent, AgentIssueEventChange } from '@haus/api';

export const nextTurnNoticeGuidance =
    'Their details arrive in your next turn. Keep working; the notice is not itself a request, so do not acknowledge it.';

const assignmentGuidance =
    '`haus issue show <code>` prints an Issue with its comments, and `haus issue list` is your whole queue. Take them one at a time, by priority then age: set the one you start `in_progress` with `haus issue update <code> --state in_progress`, and leave the rest until it is done or waiting on a person.';

const crewGuidance =
    'An Issue that takes longer than a reply is crew work: `haus task start --issue <code> --title <text> < brief` starts a Task that holds it.';

const eventGuidance =
    '`haus issue show <code>` prints the whole Issue. Answer a comment with `haus issue comment <code> --reply-to <commentId>`; an update that needs nothing from you needs no reply.';

/**
 * A Captain starts crew for an Issue. A Task cannot, and a session whose kind the runner could
 * not read gets no crew line rather than a recipe it may be refused.
 */
export function composeIssueAssignmentInput(
    assignments: readonly AgentIssueAssignment[],
    recipient: 'captain' | 'task' | null
) {
    return [
        `${assignments.length} ${plural(assignments.length, 'Issue')} assigned to you:`,
        ...assignments.map(
            (issue) =>
                `[Haus issue assignment ${issue.code} priority=${issue.priority} state=${issue.state}${byField(issue)}] ${flattened(issue.title)}`
        ),
        '',
        recipient === 'captain' ? `${assignmentGuidance} ${crewGuidance}` : assignmentGuidance,
    ].join('\n');
}

export function composeIssueEventInput(events: readonly AgentIssueEvent[]) {
    return [
        `${events.length} ${plural(events.length, 'update')} on Issues assigned to you:`,
        ...events.flatMap(formatEvent),
        '',
        eventGuidance,
    ].join('\n');
}

export function formatIssueItemsNotice(total: number) {
    return `${total} ${plural(total, 'Issue update')} for you`;
}

function formatEvent(event: AgentIssueEvent) {
    const head = `[Haus issue ${changeLabel(event.code, event.change)}${byField(event)}] ${flattened(event.title)}`;
    if (event.change.kind !== 'commented') {
        return [head];
    }
    const more = event.change.truncated ? ' …' : '';
    return [head, `> ${flattened(event.change.body)}${more}`];
}

function changeLabel(code: string, change: AgentIssueEventChange) {
    if (change.kind === 'commented') {
        return `comment ${code} commentId=${change.commentId}`;
    }
    if (change.kind === 'state_changed') {
        return `state ${code} ${change.from}→${change.to}`;
    }
    return `sub-issues closed ${code} total=${change.total}`;
}

function byField(item: { by: string | null }) {
    return item.by ? ` by=${item.by}` : '';
}

function plural(count: number, singular: string) {
    return count === 1 ? singular : `${singular}s`;
}

function flattened(value: string) {
    return value.replaceAll(/\s+/gu, ' ').trim();
}

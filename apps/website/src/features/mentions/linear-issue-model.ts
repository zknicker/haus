import type { LinearIssueResult, LinearIssueUrl, LinearIssueView } from '@haus/api';
import { formatRelativeTime } from '../../lib/format.ts';

/** Linear's own mark, shown the way any website chip shows its favicon. */
export const linearMarkUrl = 'https://linear.app/favicon.ico';

/** The Agent fields a chip and its card name; the App's Agent list supplies them. */
export interface LinearChipAgent {
    avatarUrl: string | null;
    displayName: string;
    id: string;
}

/**
 * What the chip shows at each point of its read. A Server with no matching
 * workspace keeps the link a plain website link; everything else is an issue
 * chip that starts with the key the URL already carries.
 */
export type LinearChipState =
    | { kind: 'plain' }
    | { kind: 'issue'; label: string; pending: boolean; view: LinearIssueView | null };

export function linearChipState(
    issue: LinearIssueUrl,
    read: { data: LinearIssueResult | undefined; enabled: boolean; isError: boolean }
): LinearChipState {
    if (!read.enabled) {
        return { kind: 'plain' };
    }
    const { data } = read;
    if (data?.status === 'unavailable' && data.reason === 'workspace_not_connected') {
        return { kind: 'plain' };
    }
    if (data?.status === 'available') {
        return {
            kind: 'issue',
            label: `${data.issue.identifier} ${data.issue.title}`.trim(),
            pending: false,
            view: data.issue,
        };
    }
    return {
        kind: 'issue',
        label: issue.identifier,
        pending: data === undefined && !read.isError,
        view: null,
    };
}

export interface LinearIssueHoverModel {
    assignee: string | null;
    delegate: LinearChipAgent | null;
    identifier: string;
    labels: LinearIssueView['labels'];
    /** "Juniper updated issue · 3h ago", or null when no Agent change is on record. */
    lastChange: string | null;
    state: LinearIssueView['state'];
    thumbnailUrl: string | null;
    title: string;
}

/** The card's facts, each said once. */
export function linearIssueHoverModel(
    view: LinearIssueView,
    agents: readonly LinearChipAgent[],
    now = Date.now()
): LinearIssueHoverModel {
    const agentById = (id: string | null) =>
        id === null ? null : (agents.find((agent) => agent.id === id) ?? null);
    const changer = view.lastAgentChange ? agentById(view.lastAgentChange.agentId) : null;
    return {
        assignee: view.assignee?.name || null,
        delegate: agentById(view.delegateAgentId),
        identifier: view.identifier,
        labels: view.labels,
        lastChange: view.lastAgentChange
            ? `${changer?.displayName ?? 'An Agent'} ${lowerFirst(view.lastAgentChange.summary)} · ${formatRelativeTime(view.lastAgentChange.changedAt, now)}`
            : null,
        state: view.state,
        thumbnailUrl: view.thumbnailUrl,
        title: view.title || view.identifier,
    };
}

/** What the card says when it has no issue to show. */
export function linearIssueNotice(data: LinearIssueResult | undefined, isError: boolean) {
    if (data?.status === 'unavailable') {
        return data.reason === 'issue_not_found'
            ? 'Linear has no issue at this link that the workspace can see.'
            : 'Linear is not reachable right now. Reconnect it in Settings if this persists.';
    }
    return isError ? 'Issue details are unavailable right now.' : null;
}

function lowerFirst(value: string) {
    return value.charAt(0).toLowerCase() + value.slice(1);
}

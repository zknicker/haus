import {
    type LinearIssueChangedEvent,
    type LinearIssueResult,
    parseLinearIssueUrl,
} from '@haus/api';

/** A `linear.issue` read's input as its query key holds it. */
export interface LinearIssueReadInput {
    serverId: string;
    url: string;
}

/**
 * Whether one cached chip read shows the issue a delivery changed: the same
 * Server, and either the issue id it already read or the key its URL names (a
 * read that has not settled yet, or one that found nothing, has no id).
 */
export function linearIssueReadMatches(
    input: LinearIssueReadInput,
    data: LinearIssueResult | undefined,
    event: Pick<LinearIssueChangedEvent, 'identifier' | 'issueId' | 'serverId'>
): boolean {
    if (input.serverId !== event.serverId) {
        return false;
    }
    if (data?.status === 'available' && data.issue.id === event.issueId) {
        return true;
    }
    return parseLinearIssueUrl(input.url)?.identifier === event.identifier.toUpperCase();
}

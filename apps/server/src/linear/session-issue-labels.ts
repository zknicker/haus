import type { HausDatabase } from '../postgres/connection.ts';
import { workspaceCredentialId } from './agent-label-reads.ts';
import type { LinearDeliveryRow } from './delivery-handler.ts';
import { readSessionEvent } from './delivery-payload.ts';
import { readCommentIssue } from './event-projection/comment-issue-read.ts';

// The issue's label ids for Haus-app session routing. `AgentSessionEvent`
// payloads carry no label ids (only names inside `promptContext`), so the
// session handler's `prepare` reads the issue with the workspace token.

export interface LinearSessionIssueLabelDependencies {
    accessToken(credentialId: string): Promise<string>;
    db: HausDatabase;
    fetch: typeof fetch;
}

/** What `prepare` hands `apply`: label ids, or null when no read was possible. */
export interface PreparedSessionLabels {
    labelIds: string[] | null;
}

export type ReadSessionIssueLabels = (row: LinearDeliveryRow) => Promise<PreparedSessionLabels>;

/**
 * Reads the issue's labels for a Haus-app session event that may route by
 * label. A workspace without its credential yields null (the handler falls
 * back to `promptContext`); a failed read throws, so the delivery retries.
 */
export function linearSessionIssueLabels(
    dependencies: LinearSessionIssueLabelDependencies
): ReadSessionIssueLabels {
    return async (row) => {
        const facts = readSessionEvent(row.body);
        const routes =
            row.receiver === 'app' &&
            facts !== null &&
            (facts.action === 'created' || facts.action === 'prompted') &&
            facts.signal !== 'stop';
        if (!(routes && facts)) {
            return { labelIds: null };
        }
        const credentialId = await workspaceCredentialId(dependencies.db, row.workspaceId);
        if (!credentialId) {
            return { labelIds: null };
        }
        const token = await dependencies.accessToken(credentialId);
        const issue = await readCommentIssue(dependencies.fetch, token, facts.issue.id);
        return { labelIds: issue.labels.map((label) => label.id) };
    };
}

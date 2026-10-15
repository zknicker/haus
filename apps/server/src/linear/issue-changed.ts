import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearWorkspacesTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { linearIssueChangedTopic } from '../realtime/topics.ts';
import type { LinearDeliveryRow } from './delivery-handler.ts';
import { readDataChange, text } from './delivery-payload.ts';
import { evictLinearIssue } from './issue-reference.ts';

/**
 * The issue-chip hook of the data-change handler
 * (specs/linear-app.md#issue-references-in-chat): an `Issue` delivery drops
 * the cached chip and prepares `linear.onIssueChanged`, published after commit.
 * Eviction is safe even if the transaction rolls back: the next read refetches.
 */
export async function linearIssueChanged(
    tx: HausDatabase,
    row: LinearDeliveryRow
): Promise<PreparedRealtimeEvent | null> {
    if (row.event !== 'Issue') {
        return null;
    }
    const change = readDataChange(row.body);
    const identifier = change ? text(change.data, 'identifier') : null;
    if (!(change && identifier)) {
        return null;
    }
    evictLinearIssue(row.workspaceId, change.entityId);
    const [workspace] = await tx
        .select({ connectionId: linearWorkspacesTable.connectionId })
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, row.workspaceId))
        .limit(1);
    if (!workspace?.connectionId) {
        return null;
    }
    return linearIssueChangedTopic.prepare({
        connectionId: workspace.connectionId,
        identifier,
        issueId: change.entityId,
        serverId: row.serverId,
    });
}

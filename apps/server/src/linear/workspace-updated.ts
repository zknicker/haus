import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearWorkspacesTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { linearUpdatedTopic } from '../realtime/topics.ts';

/**
 * `linear.onUpdated` for a workspace whose Server-side state a background
 * path changed (team access, a revocation), prepared inside the caller's
 * transaction and published after commit. Null once the workspace has no
 * connection to announce on.
 */
export async function prepareLinearWorkspaceUpdated(
    db: HausDatabase,
    input: { serverId: string; workspaceId: string }
): Promise<PreparedRealtimeEvent | null> {
    const [workspace] = await db
        .select({ connectionId: linearWorkspacesTable.connectionId })
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, input.workspaceId))
        .limit(1);
    if (!workspace?.connectionId) {
        return null;
    }
    return linearUpdatedTopic.prepare({
        connectionId: workspace.connectionId,
        serverId: input.serverId,
    });
}

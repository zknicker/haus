import { and, eq } from 'drizzle-orm';
import { followAgentThread } from '../agent-api/attention.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageTasksTable } from '../postgres/schema.ts';

type FollowWriter = Pick<HausDatabase, 'execute' | 'insert' | 'select'>;

/**
 * Promotion no longer creates a task's Thread, so the claimant's attention has
 * to attach when the Thread finally exists. The moment the first reply
 * materializes a Thread whose anchor carries a task, the task's Agent assignee
 * and its Agent creator start following it — the same follows the old eager
 * promotion wrote, moved to the moment they can mean something.
 */
export async function followMaterializedTaskThread(
    db: FollowWriter,
    input: { anchorMessageId: string; serverId: string; threadChatId: string }
): Promise<void> {
    const [task] = await db
        .select({
            assigneeAgentId: messageTasksTable.assigneeAgentId,
            createdByAgentId: messageTasksTable.createdByAgentId,
        })
        .from(messageTasksTable)
        .where(
            and(
                eq(messageTasksTable.serverId, input.serverId),
                eq(messageTasksTable.messageId, input.anchorMessageId)
            )
        )
        .limit(1);
    if (!task) {
        return;
    }
    const agentIds = [...new Set([task.assigneeAgentId, task.createdByAgentId])].filter(
        (agentId): agentId is string => agentId !== null
    );
    for (const agentId of agentIds) {
        await followAgentThread(db, {
            agentId,
            serverId: input.serverId,
            threadChatId: input.threadChatId,
        });
    }
}

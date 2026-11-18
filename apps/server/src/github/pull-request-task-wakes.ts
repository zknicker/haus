import { and, eq, inArray, isNotNull, notExists } from 'drizzle-orm';

import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentWorkTable, taskPullRequestsTable, tasksTable } from '../postgres/schema.ts';

export interface UnworkedTaskWake {
    agentId: string;
    chatId: string;
}

export async function readUnworkedTaskWakes(
    db: Pick<HausDatabase, 'select'>,
    pull: { number: number; repository: string; serverId: string }
): Promise<UnworkedTaskWake[]> {
    const rows = await db
        .select({ agentId: tasksTable.assigneeAgentId, chatId: tasksTable.chatId })
        .from(taskPullRequestsTable)
        .innerJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, taskPullRequestsTable.serverId),
                eq(tasksTable.id, taskPullRequestsTable.taskId)
            )
        )
        .where(
            and(
                eq(taskPullRequestsTable.serverId, pull.serverId),
                eq(taskPullRequestsTable.repository, pull.repository),
                eq(taskPullRequestsTable.number, pull.number),
                isNotNull(tasksTable.assigneeAgentId),
                isNotNull(tasksTable.chatId),
                inArray(tasksTable.state, ['todo', 'open']),
                notExists(
                    db
                        .select({ id: cloudAgentWorkTable.id })
                        .from(cloudAgentWorkTable)
                        .where(
                            and(
                                eq(cloudAgentWorkTable.serverId, tasksTable.serverId),
                                eq(cloudAgentWorkTable.taskId, tasksTable.id)
                            )
                        )
                )
            )
        );
    return rows.flatMap((row) =>
        row.agentId && row.chatId ? [{ agentId: row.agentId, chatId: row.chatId }] : []
    );
}

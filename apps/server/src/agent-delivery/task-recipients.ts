import { sql } from 'drizzle-orm';

import { openAgentChatRead } from '../agent-reads/agent-chat-reads.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentTaskFollowsTable } from '../postgres/schema.ts';

export async function followMentionedIntoTask(
    db: HausDatabase,
    input: {
        agentIds: string[];
        causeMessageId: string | null;
        followByAgent: Map<string, boolean>;
        mentioned: Set<string>;
        serverId: string;
        taskChatId: string;
    }
): Promise<Set<string>> {
    const reactivated = new Set<string>();
    for (const agentId of input.mentioned) {
        const previousFollow = input.followByAgent.get(agentId);
        if (!input.agentIds.includes(agentId) || previousFollow === true) {
            continue;
        }
        await db
            .insert(agentTaskFollowsTable)
            .values({ agentId, serverId: input.serverId, taskChatId: input.taskChatId })
            .onConflictDoUpdate({
                set: { followed: true, updatedAt: sql`now()` },
                target: [
                    agentTaskFollowsTable.serverId,
                    agentTaskFollowsTable.agentId,
                    agentTaskFollowsTable.taskChatId,
                ],
            });
        await openAgentChatRead(db, {
            agentId,
            causeMessageId: input.causeMessageId,
            chatId: input.taskChatId,
            serverId: input.serverId,
        });
        if (previousFollow === false) {
            reactivated.add(agentId);
        }
        input.followByAgent.set(agentId, true);
    }
    return reactivated;
}

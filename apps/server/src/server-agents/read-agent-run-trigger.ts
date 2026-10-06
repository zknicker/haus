import type { AgentRunTrigger, AgentRunTriggerInput } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable, chatsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireAgent } from './agent-delivery-control.ts';
import { agentTurnTrigger } from './agent-turn-trigger.ts';

/**
 * The work that woke one run, recorded at dispatch, so a running turn can be
 * titled before it settles. Gated by the reader's Chat visibility exactly as
 * `agent.turns` gates a settled turn's trigger.
 */
export async function readAgentRunTrigger(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentRunTriggerInput
): Promise<AgentRunTrigger> {
    await requireServerMembership(db, member, input.serverId);
    await requireAgent(db, input);

    const [row] = await db
        .select({
            chatId: agentRunTriggersTable.chatId,
            source: agentRunTriggersTable.source,
            visibleChatId: chatsTable.id,
            workId: agentRunTriggersTable.workId,
        })
        .from(agentRunTriggersTable)
        .leftJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, agentRunTriggersTable.serverId),
                eq(chatsTable.id, agentRunTriggersTable.chatId),
                isNull(chatsTable.deletedAt),
                // Membership was required above, so a null member never reaches here.
                visibleChats(member?.id ?? '')
            )
        )
        .where(
            and(
                eq(agentRunTriggersTable.serverId, input.serverId),
                eq(agentRunTriggersTable.agentId, input.agentId),
                eq(agentRunTriggersTable.runId, input.runId)
            )
        )
        .limit(1);

    return {
        trigger: agentTurnTrigger(
            row
                ? {
                      chatId: row.chatId,
                      source: row.source,
                      visible: row.visibleChatId !== null,
                      workId: row.workId,
                  }
                : null
        ),
    };
}

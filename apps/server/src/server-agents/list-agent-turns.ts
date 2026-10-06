import { type AgentTurn, type AgentTurnsInput, agentTurnActivitySummarySchema } from '@haus/api';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable, agentTurnsTable, chatsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireAgent } from './agent-delivery-control.ts';
import { agentTurnTrigger } from './agent-turn-trigger.ts';

/**
 * One Agent's settled turns, newest first. `outputProduced` is the field that
 * separates a silent turn from a lost one, so an observer can settle "did it
 * answer?" without reading Computer-local execution traces. Each turn names the
 * work that woke it in one joined read, gated by the reader's Chat visibility.
 */
export async function listAgentTurns(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentTurnsInput
): Promise<AgentTurn[]> {
    await requireServerMembership(db, member, input.serverId);
    await requireAgent(db, input);

    const rows = await db
        .select({
            activity: agentTurnsTable.activity,
            endedAt: agentTurnsTable.endedAt,
            failureKind: agentTurnsTable.failureKind,
            messageCount: agentTurnsTable.messageCount,
            outputProduced: agentTurnsTable.outputProduced,
            runId: agentTurnsTable.runId,
            startedAt: agentTurnsTable.startedAt,
            status: agentTurnsTable.status,
            summary: agentTurnsTable.summary,
            triggerChatId: agentRunTriggersTable.chatId,
            triggerSource: agentRunTriggersTable.source,
            triggerVisibleChatId: chatsTable.id,
            triggerWorkId: agentRunTriggersTable.workId,
        })
        .from(agentTurnsTable)
        .leftJoin(
            agentRunTriggersTable,
            and(
                eq(agentRunTriggersTable.serverId, agentTurnsTable.serverId),
                eq(agentRunTriggersTable.agentId, agentTurnsTable.agentId),
                eq(agentRunTriggersTable.runId, agentTurnsTable.runId)
            )
        )
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
                eq(agentTurnsTable.serverId, input.serverId),
                eq(agentTurnsTable.agentId, input.agentId),
                input.runId ? eq(agentTurnsTable.runId, input.runId) : undefined
            )
        )
        .orderBy(desc(agentTurnsTable.startedAt))
        .limit(input.limit);

    return rows.map(
        ({ triggerChatId, triggerSource, triggerVisibleChatId, triggerWorkId, ...row }) => ({
            ...row,
            activity: agentTurnActivitySummarySchema.parse(row.activity),
            agentId: input.agentId,
            endedAt: row.endedAt.toISOString(),
            startedAt: row.startedAt.toISOString(),
            trigger: agentTurnTrigger(
                triggerChatId && triggerSource && triggerWorkId
                    ? {
                          chatId: triggerChatId,
                          source: triggerSource,
                          visible: triggerVisibleChatId !== null,
                          workId: triggerWorkId,
                      }
                    : null
            ),
        })
    );
}

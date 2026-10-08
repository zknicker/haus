import { type AgentTurn, type AgentTurnsInput, agentTurnActivitySummarySchema } from '@haus/api';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable, agentTurnsTable, chatsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireMemberAgent } from './agent-delivery-control.ts';
import { resolveAgentTurnTriggers } from './agent-turn-trigger-previews.ts';

/**
 * One Agent's settled turns, newest first. `outputProduced` is the field that
 * separates a silent turn from a lost one, so an observer can settle "did it
 * answer?" without reading Computer-local execution traces. Each turn names the
 * work that woke it, gated by the reader's Chat visibility: one joined read plus
 * one read quoting the waking messages.
 */
export async function listAgentTurns(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentTurnsInput
): Promise<AgentTurn[]> {
    await requireMemberAgent(db, member, input);

    return await readSettledTurns(db, member, {
        serverId: input.serverId,
        limit: input.limit,
        orderBy: [desc(agentTurnsTable.startedAt)],
        where: and(
            eq(agentTurnsTable.serverId, input.serverId),
            eq(agentTurnsTable.agentId, input.agentId),
            input.runId ? eq(agentTurnsTable.runId, input.runId) : undefined
        ),
    });
}

/**
 * Settled turns matching `where`, each with its trigger joined and gated by
 * the reader's Chat visibility. Callers must have required Server membership.
 */
export async function readSettledTurns(
    db: HausDatabase,
    member: HausUser | null,
    query: { limit: number; orderBy: SQL[]; serverId: string; where: SQL | undefined }
): Promise<AgentTurn[]> {
    const rows = await db
        .select({
            activity: agentTurnsTable.activity,
            agentId: agentTurnsTable.agentId,
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
                // Callers required membership, so a null member never reaches here.
                visibleChats(member?.id ?? '')
            )
        )
        .where(query.where)
        .orderBy(...query.orderBy)
        .limit(query.limit);

    const triggers = await resolveAgentTurnTriggers(
        db,
        query.serverId,
        rows.map((row) =>
            row.triggerChatId && row.triggerSource && row.triggerWorkId
                ? {
                      chatId: row.triggerChatId,
                      source: row.triggerSource,
                      visible: row.triggerVisibleChatId !== null,
                      workId: row.triggerWorkId,
                  }
                : null
        )
    );
    return rows.map(
        (
            {
                triggerChatId: _chat,
                triggerSource: _source,
                triggerVisibleChatId: _visible,
                triggerWorkId: _work,
                ...row
            },
            index
        ) => ({
            ...row,
            activity: agentTurnActivitySummarySchema.parse(row.activity),
            endedAt: row.endedAt.toISOString(),
            startedAt: row.startedAt.toISOString(),
            trigger: triggers[index] ?? null,
        })
    );
}

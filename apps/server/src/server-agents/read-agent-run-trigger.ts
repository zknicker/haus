import type { AgentRunTrigger, AgentRunTriggerEntry, AgentRunTriggerInput } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable, chatsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireMemberAgent } from './agent-delivery-control.ts';
import type { AgentTurnTriggerRecord } from './agent-turn-trigger.ts';
import { resolveAgentTurnTriggers } from './agent-turn-trigger-previews.ts';

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
    await requireMemberAgent(db, member, input);

    const [row] = await readTriggerRows(db, member, { ...input, runIds: [input.runId] });
    const [trigger = null] = await resolveAgentTurnTriggers(db, input.serverId, [row ?? null]);
    return { trigger };
}

/**
 * The triggers of the runs on one Activity History page, so a run still working
 * is titled in the same read. Callers must have required Server membership.
 */
export async function readAgentRunTriggers(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; runIds: readonly string[]; serverId: string }
): Promise<AgentRunTriggerEntry[]> {
    const runIds = [...new Set(input.runIds)];
    if (runIds.length === 0) {
        return [];
    }
    const rows = await readTriggerRows(db, member, { ...input, runIds });
    const triggers = await resolveAgentTurnTriggers(db, input.serverId, rows);
    const byRunId = new Map(rows.map((row, index) => [row.runId, triggers[index] ?? null]));
    return runIds.map((runId) => ({ runId, trigger: byRunId.get(runId) ?? null }));
}

async function readTriggerRows(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; runIds: readonly string[]; serverId: string }
): Promise<(AgentTurnTriggerRecord & { runId: string })[]> {
    const rows = await db
        .select({
            chatId: agentRunTriggersTable.chatId,
            runId: agentRunTriggersTable.runId,
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
                // Membership was required by the caller, so a null member never reaches here.
                visibleChats(member?.id ?? '')
            )
        )
        .where(
            and(
                eq(agentRunTriggersTable.serverId, input.serverId),
                eq(agentRunTriggersTable.agentId, input.agentId),
                inArray(agentRunTriggersTable.runId, [...input.runIds])
            )
        );
    return rows.map(({ visibleChatId, ...row }) => ({ ...row, visible: visibleChatId !== null }));
}

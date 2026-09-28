import { and, eq, inArray } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, messageTasksTable } from '../postgres/schema.ts';
import { AgentTaskError } from './task-error.ts';

export async function findAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: { messageId?: string; numbers?: number[] }
) {
    const rows = await queryAgentTasks(db, runner, chatId, input);
    if (rows.length === 0) {
        throw new AgentTaskError('No matching task exists in that target.');
    }
    return rows;
}

export async function queryAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: { messageId?: string; numbers?: number[] }
) {
    return await db
        .select()
        .from(messageTasksTable)
        .where(
            and(
                eq(messageTasksTable.serverId, runner.serverId),
                eq(messageTasksTable.chatId, chatId),
                input.messageId ? eq(messageTasksTable.messageId, input.messageId) : undefined,
                input.numbers?.length ? inArray(messageTasksTable.number, input.numbers) : undefined
            )
        );
}

/**
 * Tasks live on top-level messages only. Promotion validates that here and
 * stops: the Thread is not created until someone actually replies, so a claim
 * an Agent resolves inside one turn leaves no work surface behind.
 */
export async function requireTopLevelTaskChat(
    db: HausDatabase,
    runner: ResolvedRunner,
    parentChatId: string
) {
    const [parent] = await db
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, parentChatId)));
    if (!parent || parent.kind === 'thread') {
        throw new AgentTaskError('Tasks require a top-level Channel or DM.');
    }
}

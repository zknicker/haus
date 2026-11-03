import { and, eq, inArray } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, messageTasksTable } from '../postgres/schema.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import { AgentTaskError } from './task-error.ts';

/**
 * Resolves a task command's target. `chatId` is the Chat it names; `taskChatId`
 * is the top-level Channel or DM that numbers its tasks, so a Thread target and
 * its parent find the same task numbers.
 */
export async function resolveAgentTaskTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
) {
    const chatId = await resolveAgentTarget(db, runner, target);
    const [chat] = await db
        .select({ kind: chatsTable.kind, parentChatId: chatsTable.parentChatId })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (chat?.kind === 'thread' && chat.parentChatId) {
        return { chatId, taskChatId: chat.parentChatId };
    }
    return { chatId, taskChatId: chatId };
}

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
 * `haus task create` posts a new top-level message, so it needs a top-level
 * Channel or DM. Claiming an existing message may also land in a Thread.
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

import { and, eq, sql } from 'drizzle-orm';
import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageTasksTable } from '../postgres/schema.ts';
import { prepareTaskEvent } from '../tasks/task-events.ts';
import { followAgentThread } from './attention.ts';
import { AgentTaskError } from './task-error.ts';

type TaskRecord = typeof messageTasksTable.$inferSelect;

/**
 * Turns a message the Agent claimed by id into its task. A message in a
 * Channel or DM becomes a top-level task; a message inside a Thread becomes a
 * Thread task, numbered and owned by the Thread's parent and worked in the
 * Thread it sits in. The task Thread is never created here: a top-level claim
 * an Agent resolves inside one turn leaves no work surface behind.
 */
export async function promoteAgentMessageTask(
    tx: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    messageId: string
) {
    const place = await taskPlacement(tx, runner, chatId, messageId);
    const [message] = await tx
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.chatId, place.threadChatId ?? place.chatId),
                eq(chatMessagesTable.id, messageId)
            )
        )
        .limit(1);
    if (!message) {
        throw new AgentTaskError('That message is not in the selected target.');
    }
    // The update locks the numbering Chat's row, so concurrent claims in a
    // Thread and in its parent draw distinct numbers from the one sequence.
    const [numberedChat] = await tx
        .update(chatsTable)
        .set({ lastTaskNumber: sql`${chatsTable.lastTaskNumber} + 1` })
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, place.chatId)))
        .returning({ number: chatsTable.lastTaskNumber });
    if (!numberedChat) {
        throw new AgentTaskError('That task target no longer exists.');
    }
    const [task] = await tx
        .insert(messageTasksTable)
        .values({
            assigneeAgentId: runner.agentId,
            chatId: place.chatId,
            claimedAt: sql`now()`,
            createdByAgentId: runner.agentId,
            messageId,
            number: numberedChat.number,
            origin: 'claimed',
            serverId: runner.serverId,
            status: 'in_progress',
            threadChatId: place.threadChatId,
        })
        .returning();
    if (!task) {
        throw new Error('Task conversion did not persist.');
    }
    await followClaimedTask(tx, runner, task, 'fresh');
    const event = prepareTaskEvent({
        chatId: place.chatId,
        messageId,
        serverId: runner.serverId,
        threadChatId: place.threadChatId,
        type: 'task.created',
    });
    return { event, task };
}

/**
 * The claimant follows the task's replies: the inline reply chain of a
 * top-level task, or the Thread a Thread task sits in (inline replies do not
 * exist inside a Thread). Re-confirming a claim the Agent already holds
 * leaves its Thread follow alone, so an explicit unfollow survives.
 */
export async function followClaimedTask(
    tx: HausDatabase,
    runner: ResolvedRunner,
    task: TaskRecord,
    claim: 'fresh' | 'reconfirm'
) {
    if (task.threadChatId) {
        if (claim === 'reconfirm') {
            return;
        }
        await followAgentThread(tx, {
            agentId: runner.agentId,
            serverId: runner.serverId,
            threadChatId: task.threadChatId,
        });
        return;
    }
    await followInlineReplyForMessage(tx, {
        agentId: runner.agentId,
        chatId: task.chatId,
        messageId: task.messageId,
        serverId: runner.serverId,
    });
}

/**
 * Where a claimed message's task lives: its top-level Chat, and its Thread if
 * any. A Thread's anchor sits in the parent, so claiming it through the Thread
 * target makes an ordinary top-level task.
 */
async function taskPlacement(
    tx: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    messageId: string
): Promise<{ chatId: string; threadChatId: null | string }> {
    const [chat] = await tx
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            kind: chatsTable.kind,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (!chat) {
        throw new AgentTaskError('Tasks require a Channel, DM, or Thread.');
    }
    if (chat.kind !== 'thread') {
        return { chatId, threadChatId: null };
    }
    if (!chat.parentChatId) {
        throw new AgentTaskError('That Thread has no parent Channel or DM.');
    }
    if (chat.anchorMessageId === messageId) {
        return { chatId: chat.parentChatId, threadChatId: null };
    }
    return { chatId: chat.parentChatId, threadChatId: chatId };
}

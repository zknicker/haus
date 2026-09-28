import type { MessageTask } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { targetForChat } from '../agent-api/message-view.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentThreadFollowsTable, chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { taskAssignmentEnvelope, taskAssignmentKey } from './task-assignment-envelope.ts';

/**
 * Hands an assigned Agent its typed `task_assignment` delivery and the
 * follows that keep the task's replies reaching it. Runs inside the
 * assignment's transaction.
 */
export async function deliverTaskAssignment(
    tx: HausDatabase,
    agentDelivery: AgentDelivery,
    input: {
        agentId: string;
        assignedByHandle: null | string;
        serverId: string;
        task: MessageTask;
    }
) {
    const { agentId, serverId, task } = input;
    await followInlineReplyForMessage(tx, {
        agentId,
        chatId: task.chatId,
        messageId: task.messageId,
        serverId,
    });
    // Follow first: thread delivery is gated on this row, so without it the
    // Agent would wake, claim, and then never see a single reply. A Thread
    // nobody has replied in has no row to point at yet; the first reply
    // materializes it and attaches the assignee's follow.
    const [thread] = await tx
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, task.threadChatId)))
        .limit(1);
    if (thread) {
        await tx
            .insert(agentThreadFollowsTable)
            .values({
                agentId,
                followed: true,
                serverId,
                threadChatId: task.threadChatId,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                set: { followed: true, updatedAt: new Date() },
                target: [
                    agentThreadFollowsTable.serverId,
                    agentThreadFollowsTable.agentId,
                    agentThreadFollowsTable.threadChatId,
                ],
            });
    }

    // The task's title is its canonical message's content.
    const [anchor] = await tx
        .select({ content: chatMessagesTable.content })
        .from(chatMessagesTable)
        .where(
            and(eq(chatMessagesTable.serverId, serverId), eq(chatMessagesTable.id, task.messageId))
        )
        .limit(1);
    // The handoff is a private Agent delivery, so it is typed pending work and
    // never a Chat message. The delivery key carries the new version: a task
    // can be reassigned many times.
    await agentDelivery.enqueue(tx, {
        agentId,
        chatId: task.chatId,
        content: taskAssignmentEnvelope({
            assignedByHandle: input.assignedByHandle,
            number: task.number,
            target: await targetForChat(tx, serverId, task.chatId),
            title: anchor?.content ?? '',
        }),
        dedupeKey: taskAssignmentKey(task.messageId, task.version),
        mentioned: true,
        serverId,
        source: 'task_assignment',
    });
}

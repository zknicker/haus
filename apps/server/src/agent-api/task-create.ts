import type { AgentActivityEvent, AgentTaskCreateInput } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { readAgentSessionGeneration } from '../agent-delivery/cursors.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import { advanceAgentChatReadsSeen } from '../agent-reads/agent-chat-reads.ts';
import { requireChatWritable } from '../chats/chat-access.ts';
import {
    recordCloudAgentWorkLinks,
    resolveCloudAgentWorkLinks,
} from '../chats/cloud-agent-work-links.ts';
import { mentionedUserIds } from '../chats/mentioned-user-ids.ts';
import { prepareMessageCreatedEvent } from '../chats/message-created-event.ts';
import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import { prepareLinkedWorkEvents } from '../cloud-agents/cloud-agent-events.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable, messageTasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { taskAssignmentEnvelope, taskAssignmentKey } from '../tasks/task-assignment-envelope.ts';
import { prepareTaskEvent } from '../tasks/task-events.ts';
import { messageSelection, targetForChat } from './message-view.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import {
    dedupeRecipients,
    replayAgentTasks,
    resolveTaskAssignee,
    taskNonce,
} from './task-create-inputs.ts';
import { AgentTaskError } from './task-error.ts';
import { requireTopLevelTaskChat } from './task-lookup.ts';
import { type AgentTaskRow, agentHandle, taskRow } from './task-row.ts';

export async function createAgentTasks(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentTaskCreateInput,
    agentDelivery: AgentDelivery
) {
    const titles = input.titles?.length ? input.titles : input.content ? [input.content] : [];
    if (titles.length === 0 || titles.some((title) => !title.trim())) {
        throw new AgentTaskError('Task content is required.');
    }
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const assigneeAgentId = input.assignee
        ? await resolveTaskAssignee(db, runner, chatId, input.assignee)
        : null;
    const selfClaim = assigneeAgentId === runner.agentId;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        await requireChatWritable(tx, { chatId, serverId: runner.serverId });
        await requireTopLevelTaskChat(tx, runner, chatId);
        const replay = await replayAgentTasks(
            tx,
            runner,
            chatId,
            titles,
            input.nonce,
            assigneeAgentId
        );
        if (replay) {
            return { activities: [], events: [], tasks: replay, wakes: [] };
        }
        const sessionGeneration = await readAgentSessionGeneration(tx, runner.agentId);
        const created: AgentTaskRow[] = [];
        const activities: AgentActivityEvent[] = [];
        const events: PreparedRealtimeEvent[] = [];
        const wakes = new Set<string>();
        for (const [index, title] of titles.entries()) {
            const startedActivity = await appendServerAgentActivity(tx, {
                agentId: runner.agentId,
                category: 'sending_message',
                phase: 'started',
                runId: runner.runId,
                serverId: runner.serverId,
            });
            if (startedActivity) {
                activities.push(startedActivity);
            }
            const [numberedChat] = await tx
                .update(chatsTable)
                .set({
                    lastActivityAt: sql`now()`,
                    lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1`,
                    lastTaskNumber: sql`${chatsTable.lastTaskNumber} + 1`,
                })
                .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
                .returning({
                    messageSequence: chatsTable.lastMessageSequence,
                    taskNumber: chatsTable.lastTaskNumber,
                });
            if (!numberedChat) {
                throw new AgentTaskError('That task target no longer exists.');
            }
            const { content, links } = await resolveCloudAgentWorkLinks(tx, {
                author: { agentId: runner.agentId, kind: 'agent' },
                content: title.trim(),
                serverId: runner.serverId,
            });
            const messageId = createOpaqueId('msg');
            const [message] = await tx
                .insert(chatMessagesTable)
                .values({
                    authorAgentId: runner.agentId,
                    chatId,
                    content,
                    id: messageId,
                    mentionedUserIds: mentionedUserIds(content),
                    nonce: taskNonce(input.nonce, index),
                    replyRootMessageId: messageId,
                    runId: runner.runId,
                    sequence: numberedChat.messageSequence,
                    serverId: runner.serverId,
                    sessionGeneration,
                })
                .returning(messageSelection);
            await recordCloudAgentWorkLinks(tx, {
                chatId,
                links,
                messageId,
                serverId: runner.serverId,
            });
            // Own messages count as read; unseen messages from others below stay unread.
            await advanceAgentChatReadsSeen(tx, {
                agentId: runner.agentId,
                chatIds: [chatId],
                serverId: runner.serverId,
            });
            const completedActivity = await appendServerAgentActivity(tx, {
                agentId: runner.agentId,
                category: 'sending_message',
                phase: 'completed',
                runId: runner.runId,
                serverId: runner.serverId,
            });
            if (completedActivity) {
                activities.push(completedActivity);
            }
            await tx.insert(messageTasksTable).values({
                assigneeAgentId,
                chatId,
                claimedAt: selfClaim ? sql`now()` : null,
                createdByAgentId: runner.agentId,
                messageId: message.id,
                number: numberedChat.taskNumber,
                origin: 'composed',
                serverId: runner.serverId,
                status: selfClaim ? 'in_progress' : 'todo',
            });
            if (assigneeAgentId) {
                await followInlineReplyForMessage(tx, {
                    agentId: assigneeAgentId,
                    chatId,
                    messageId: message.id,
                    serverId: runner.serverId,
                });
            }
            // The handoff is a private Agent delivery: a typed inbox item keyed
            // by the assignment identity, never a hidden Chat message.
            const assignmentEnvelope =
                assigneeAgentId && assigneeAgentId !== runner.agentId
                    ? taskAssignmentEnvelope({
                          assignedByHandle: await agentHandle(tx, runner),
                          number: numberedChat.taskNumber,
                          target: await targetForChat(tx, runner.serverId, chatId),
                          title: content,
                      })
                    : null;
            const recipients = await planAgentMessageRecipients(tx, {
                authorAgentId: runner.agentId,
                chatId,
                content,
                messageId: message.id,
                serverId: runner.serverId,
            });
            if (assigneeAgentId && assigneeAgentId !== runner.agentId) {
                recipients.push({
                    // The assignment's own concrete item carries the personal
                    // attention; the canonical task message stays ambient.
                    addressedReason: null,
                    agentId: assigneeAgentId,
                    mentioned: false,
                    threadFollowReactivated: false,
                });
            }
            for (const recipient of dedupeRecipients(recipients)) {
                await agentDelivery.enqueue(tx, {
                    addressedReason: recipient.addressedReason,
                    agentId: recipient.agentId,
                    chatId,
                    content,
                    dedupeKey: message.id,
                    mentioned: recipient.mentioned,
                    sequence: message.sequence,
                    serverId: runner.serverId,
                    source: `agent:${await agentHandle(tx, runner)}`,
                    threadFollowReactivated: recipient.threadFollowReactivated,
                });
                wakes.add(recipient.agentId);
            }
            if (assignmentEnvelope && assigneeAgentId) {
                await agentDelivery.enqueue(tx, {
                    agentId: assigneeAgentId,
                    chatId,
                    content: assignmentEnvelope,
                    dedupeKey: taskAssignmentKey(message.id, 1),
                    mentioned: true,
                    serverId: runner.serverId,
                    source: 'task_assignment',
                });
                wakes.add(assigneeAgentId);
            }
            events.push(
                await prepareMessageCreatedEvent(
                    tx,
                    {
                        ...message,
                        mentionedUserIds: mentionedUserIds(message.content),
                        serverId: runner.serverId,
                    },
                    null
                ),
                prepareTaskEvent({
                    chatId,
                    messageId: message.id,
                    serverId: runner.serverId,
                    type: 'task.created',
                }),
                ...(await prepareLinkedWorkEvents(tx, {
                    serverId: runner.serverId,
                    workIds: links.map((link) => link.workId),
                }))
            );
            const [task] = await tx
                .select()
                .from(messageTasksTable)
                .where(
                    and(
                        eq(messageTasksTable.serverId, runner.serverId),
                        eq(messageTasksTable.messageId, message.id)
                    )
                );
            created.push(await taskRow(tx, runner, message, task));
        }
        return {
            activities,
            events,
            tasks: created,
            wakes: [...wakes].map((agentId) => ({ agentId, serverId: runner.serverId })),
        };
    });
}

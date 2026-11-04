import type { AgentActivityEvent, AgentClaimCreateInput } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { readAgentSessionGeneration } from '../agent-delivery/cursors.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import { advanceAgentChatReadsSeen } from '../agent-reads/agent-chat-reads.ts';
import { requireChatWritable } from '../chats/chat-access.ts';
import { mentionedUserIds } from '../chats/mentioned-user-ids.ts';
import { prepareMessageCreatedEvent } from '../chats/message-created-event.ts';
import {
    prepareMessageLinkEvents,
    recordMessageLinks,
    resolveMessageLinks,
} from '../chats/message-links.ts';
import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import {
    claimAssignmentEnvelope,
    claimAssignmentKey,
} from '../claims/claim-assignment-envelope.ts';
import { prepareClaimEvent } from '../claims/claim-events.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    claimNonce,
    dedupeRecipients,
    replayAgentClaims,
    resolveClaimAssignee,
} from './claim-create-inputs.ts';
import { AgentClaimError } from './claim-error.ts';
import { requireTopLevelClaimChat } from './claim-lookup.ts';
import { type AgentClaimRow, agentHandle, claimRow } from './claim-row.ts';
import { messageSelection, targetForChat } from './message-view.ts';
import { resolveAgentTarget } from './resolve-target.ts';

export async function createAgentClaims(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentClaimCreateInput,
    agentDelivery: AgentDelivery
) {
    const titles = input.titles?.length ? input.titles : input.content ? [input.content] : [];
    if (titles.length === 0 || titles.some((title) => !title.trim())) {
        throw new AgentClaimError('Claim content is required.');
    }
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const assigneeAgentId = input.assignee
        ? await resolveClaimAssignee(db, runner, chatId, input.assignee)
        : null;
    const selfClaim = assigneeAgentId === runner.agentId;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        await requireChatWritable(tx, { chatId, serverId: runner.serverId });
        await requireTopLevelClaimChat(tx, runner, chatId);
        const replay = await replayAgentClaims(
            tx,
            runner,
            chatId,
            titles,
            input.nonce,
            assigneeAgentId
        );
        if (replay) {
            return { activities: [], events: [], claims: replay, wakes: [] };
        }
        const sessionGeneration = await readAgentSessionGeneration(tx, runner.agentId);
        const created: AgentClaimRow[] = [];
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
                    lastClaimNumber: sql`${chatsTable.lastClaimNumber} + 1`,
                })
                .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
                .returning({
                    messageSequence: chatsTable.lastMessageSequence,
                    claimNumber: chatsTable.lastClaimNumber,
                });
            if (!numberedChat) {
                throw new AgentClaimError('That claim target no longer exists.');
            }
            const { cloudLinks, content, imageLinks } = await resolveMessageLinks(tx, {
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
                    nonce: claimNonce(input.nonce, index),
                    replyRootMessageId: messageId,
                    runId: runner.runId,
                    sequence: numberedChat.messageSequence,
                    serverId: runner.serverId,
                    sessionGeneration,
                })
                .returning(messageSelection);
            await recordMessageLinks(tx, {
                chatId,
                cloudLinks,
                imageLinks,
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
            await tx.insert(messageClaimsTable).values({
                assigneeAgentId,
                chatId,
                claimedAt: selfClaim ? sql`now()` : null,
                createdByAgentId: runner.agentId,
                messageId: message.id,
                number: numberedChat.claimNumber,
                // Taking your own new work is a claim on a fresh message, not
                // work a person composed for someone.
                origin: selfClaim ? 'claimed' : 'composed',
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
                    ? claimAssignmentEnvelope({
                          assignedByHandle: await agentHandle(tx, runner),
                          number: numberedChat.claimNumber,
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
                    // attention; the canonical claim message stays ambient.
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
                    dedupeKey: claimAssignmentKey(message.id, 1),
                    mentioned: true,
                    serverId: runner.serverId,
                    source: 'claim_assignment',
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
                prepareClaimEvent({
                    chatId,
                    messageId: message.id,
                    serverId: runner.serverId,
                    threadChatId: null,
                    type: 'claim.created',
                }),
                ...(await prepareMessageLinkEvents(tx, {
                    cloudLinks,
                    imageLinks,
                    serverId: runner.serverId,
                }))
            );
            const [claim] = await tx
                .select()
                .from(messageClaimsTable)
                .where(
                    and(
                        eq(messageClaimsTable.serverId, runner.serverId),
                        eq(messageClaimsTable.messageId, message.id)
                    )
                );
            created.push(await claimRow(tx, runner, message, claim));
        }
        return {
            activities,
            events,
            claims: created,
            wakes: [...wakes].map((agentId) => ({ agentId, serverId: runner.serverId })),
        };
    });
}

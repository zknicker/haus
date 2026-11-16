import type { MessageClaim } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import { requireActiveDmPeer } from '../chats/active-dm-peer.ts';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import { replayCloudAgentWorkLinks } from '../chats/cloud-agent-work-links.ts';
import { replayImageGenerationLinks } from '../chats/image-generation-links.ts';
import { mentionedUserIds } from '../chats/mentioned-user-ids.ts';
import { prepareMessageCreatedEvent } from '../chats/message-created-event.ts';
import {
    prepareMessageLinkEvents,
    recordMessageLinks,
    resolveMessageLinks,
} from '../chats/message-links.ts';
import { ChatNonceConflictError } from '../chats/send-message.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ClaimNotFoundError } from './claim-errors.ts';
import { prepareClaimEvent } from './claim-events.ts';
import { findMessageClaim } from './claim-shape.ts';
import { UnclaimableMessageError } from './promote-claim.ts';

export interface CreateClaimResult {
    claim: MessageClaim;
    events: PreparedRealtimeEvent[];
    idempotent: boolean;
    wakes: Array<{ agentId: string; serverId: string }>;
}

export async function createClaim(
    db: HausDatabase,
    member: HausUser | null,
    input: {
        chatId: string;
        content: string;
        nonce: string;
        serverId: string;
    },
    agentDelivery: AgentDelivery
): Promise<CreateClaimResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!member) {
            throw new ClaimNotFoundError();
        }

        await tx.execute(sql`
            select user_id from server_memberships
            where server_id = ${input.serverId}
              and user_id = ${member.id}
              and revoked_at is null
            for update
        `);
        await requireServerMembership(tx, member, input.serverId);
        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${input.chatId}
            for update
        `);
        const chat = await requireChatWriteAccess(tx, member, input);
        if (chat.kind !== 'channel' && chat.kind !== 'dm') {
            throw new UnclaimableMessageError();
        }
        const [existing] = await tx
            .select()
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, input.serverId),
                    eq(chatMessagesTable.chatId, input.chatId),
                    eq(chatMessagesTable.nonce, input.nonce)
                )
            )
            .limit(1);
        if (existing) {
            const replayed = await replayImageGenerationLinks(tx, {
                content: await replayCloudAgentWorkLinks(tx, {
                    content: input.content,
                    messageId: existing.id,
                    serverId: input.serverId,
                }),
                messageId: existing.id,
                serverId: input.serverId,
            });
            if (existing.authorUserId !== member.id || existing.content !== replayed) {
                throw new ChatNonceConflictError();
            }
            const claim = await findMessageClaim(tx, input.serverId, existing.id);
            if (!claim) {
                throw new ChatNonceConflictError();
            }
            return { events: [], idempotent: true, claim, wakes: [] };
        }
        await requireActiveDmPeer(tx, chat);
        const [numberedChat] = await tx
            .update(chatsTable)
            .set({
                lastActivityAt: sql`now()`,
                lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1`,
                lastClaimNumber: sql`${chatsTable.lastClaimNumber} + 1`,
            })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
            .returning({
                messageSequence: chatsTable.lastMessageSequence,
                claimNumber: chatsTable.lastClaimNumber,
            });
        if (!numberedChat) {
            throw new Error('Failed to allocate claim-message identity.');
        }

        const { cloudLinks, content, imageLinks, taskLinks } = await resolveMessageLinks(tx, {
            author: { kind: 'user', userId: member.id },
            content: input.content,
            serverId: input.serverId,
        });
        const [message] = await tx
            .insert(chatMessagesTable)
            .values({
                authorUserId: member.id,
                chatId: input.chatId,
                content,
                id: createOpaqueId('msg'),
                mentionedUserIds: mentionedUserIds(content),
                nonce: input.nonce,
                sequence: numberedChat.messageSequence,
                serverId: input.serverId,
            })
            .returning();
        await recordMessageLinks(tx, {
            chatId: input.chatId,
            cloudLinks,
            imageLinks,
            messageId: message.id,
            serverId: input.serverId,
            taskLinks,
        });

        await tx.insert(messageClaimsTable).values({
            chatId: input.chatId,
            createdByUserId: member.id,
            messageId: message.id,
            number: numberedChat.claimNumber,
            origin: 'composed',
            serverId: input.serverId,
            status: 'todo',
        });

        const claim = await findMessageClaim(tx, input.serverId, message.id);
        if (!claim) {
            throw new Error('Claim creation did not persist.');
        }

        const messageEvent = await prepareMessageCreatedEvent(tx, message, null);
        const claimEvent = prepareClaimEvent({
            chatId: input.chatId,
            messageId: message.id,
            serverId: input.serverId,
            threadChatId: null,
            type: 'claim.created',
        });
        const recipients = await planAgentMessageRecipients(tx, {
            authorAgentId: null,
            chatId: input.chatId,
            content,
            messageId: message.id,
            serverId: input.serverId,
        });
        for (const recipient of recipients) {
            await agentDelivery.enqueue(tx, {
                addressedReason: recipient.addressedReason,
                agentId: recipient.agentId,
                chatId: input.chatId,
                content,
                dedupeKey: message.id,
                mentioned: recipient.mentioned,
                sequence: message.sequence,
                serverId: input.serverId,
                source: 'human',
                threadFollowReactivated: recipient.threadFollowReactivated,
            });
        }

        return {
            events: [
                messageEvent,
                claimEvent,
                ...(await prepareMessageLinkEvents(tx, {
                    cloudLinks,
                    imageLinks,
                    serverId: input.serverId,
                    taskLinks,
                })),
            ],
            idempotent: false,
            claim,
            wakes: recipients.map(({ agentId }) => ({ agentId, serverId: input.serverId })),
        };
    });
}

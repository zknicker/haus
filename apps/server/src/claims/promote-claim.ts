import type { MessageClaim } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { prepareClaimEvent } from './claim-events.ts';
import { findMessageClaim } from './claim-shape.ts';

export class ClaimMessageNotFoundError extends Error {
    constructor() {
        super('No claimable message exists in this Server with that id.');
        this.name = 'ClaimMessageNotFoundError';
    }
}

export class UnclaimableMessageError extends Error {
    constructor() {
        super('Only human or Agent messages in a top-level Channel or DM can become claims.');
        this.name = 'UnclaimableMessageError';
    }
}

export async function promoteMessageClaim(
    db: HausDatabase,
    member: HausUser | null,
    input: { messageId: string; serverId: string }
): Promise<{
    event: PreparedRealtimeEvent | null;
    idempotent: boolean;
    claim: MessageClaim;
}> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!member) {
            throw new ClaimMessageNotFoundError();
        }

        await tx.execute(sql`
            select user_id from server_memberships
            where server_id = ${input.serverId}
              and user_id = ${member.id}
              and revoked_at is null
            for update
        `);

        const [message] = await tx
            .select({
                chatId: chatMessagesTable.chatId,
                id: chatMessagesTable.id,
            })
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, input.serverId),
                    eq(chatMessagesTable.id, input.messageId)
                )
            )
            .limit(1);
        if (!message) {
            throw new ClaimMessageNotFoundError();
        }

        const chat = await requireChatWriteAccess(tx, member, {
            chatId: message.chatId,
            serverId: input.serverId,
        });
        if (chat.kind === 'thread') {
            throw new UnclaimableMessageError();
        }

        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${message.chatId}
            for update
        `);

        const existing = await findMessageClaim(tx, input.serverId, input.messageId);
        if (existing) {
            return { event: null, idempotent: true, claim: existing };
        }

        const [numberedChat] = await tx
            .update(chatsTable)
            .set({ lastClaimNumber: sql`${chatsTable.lastClaimNumber} + 1` })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, message.chatId)))
            .returning({ number: chatsTable.lastClaimNumber });
        if (!numberedChat) {
            throw new ClaimMessageNotFoundError();
        }

        // Promotion does not create the Thread. Claims never own Threads: a
        // message gets a claim, a message gets a Thread, and they meet only
        // because they share the anchor. The first reply materializes it.
        await tx.insert(messageClaimsTable).values({
            chatId: message.chatId,
            createdByUserId: member.id,
            messageId: message.id,
            number: numberedChat.number,
            origin: 'converted',
            serverId: input.serverId,
        });

        const claim = await findMessageClaim(tx, input.serverId, input.messageId);
        if (!claim) {
            throw new Error('Claim promotion did not persist.');
        }
        const event = prepareClaimEvent({
            chatId: message.chatId,
            messageId: message.id,
            serverId: input.serverId,
            threadChatId: null,
            type: 'claim.created',
        });
        return { event, idempotent: false, claim };
    });
}

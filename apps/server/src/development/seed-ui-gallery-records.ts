import { type ClaimTier, formatUserReferenceTarget, type MessageClaim } from '@haus/api';
import { eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import { appendSeedMessages } from './seed-inbox-messages.ts';

export interface GalleryContext {
    agentId: string;
    chatId: string;
    now: Date;
    reply?: { rootMessageId: string; toMessageId: string };
    serverId: string;
    userId: string;
}

export async function galleryMessage(db: HausDatabase, context: GalleryContext, content: string) {
    const id = createOpaqueId('msg');
    await appendSeedMessages(db, {
        serverId: context.serverId,
        chatId: context.chatId,
        messages: [
            {
                id,
                nonce: `dev-ui-${id}`,
                authorAgentId: context.agentId,
                content,
                createdAt: context.now,
                ...(context.reply ? { reply: context.reply } : {}),
            },
        ],
    });
    return id;
}

export function galleryReplies(context: GalleryContext, messageId: string): GalleryContext {
    return { ...context, reply: { rootMessageId: messageId, toMessageId: messageId } };
}

export async function galleryClaim(
    db: HausDatabase,
    context: GalleryContext,
    messageId: string,
    tier: ClaimTier,
    status: MessageClaim['status']
) {
    const [chat] = await db
        .update(chatsTable)
        .set({ lastClaimNumber: sql`${chatsTable.lastClaimNumber} + 1` })
        .where(eq(chatsTable.id, context.chatId))
        .returning({ number: chatsTable.lastClaimNumber });
    if (!chat) {
        throw new Error('UI gallery channel is missing');
    }
    await db.insert(messageClaimsTable).values({
        serverId: context.serverId,
        chatId: context.chatId,
        messageId,
        number: chat.number,
        origin: 'claimed',
        status,
        assigneeAgentId: context.agentId,
        createdByAgentId: context.agentId,
        claimedAt: context.now,
        trackedAt: tier === 'tracked' ? context.now : null,
    });
}

export async function galleryMention(
    db: HausDatabase,
    context: GalleryContext,
    input: { content: string; answered: boolean; discussion?: boolean }
) {
    const mention = `[@you](${formatUserReferenceTarget(context.userId)})`;
    const messageId = await galleryMessage(db, context, `${mention} ${input.content}`);
    if (!(input.discussion || input.answered)) {
        return messageId;
    }
    const replies: GalleryContext = {
        ...context,
        reply: {
            rootMessageId: context.reply?.rootMessageId ?? messageId,
            toMessageId: messageId,
        },
    };
    if (input.discussion) {
        await galleryMessage(
            db,
            replies,
            'I recommend the smaller change. This is still waiting for your answer.'
        );
    }
    if (input.answered) {
        const answerMessageId = createOpaqueId('msg');
        await appendSeedMessages(db, {
            serverId: context.serverId,
            chatId: context.chatId,
            messages: [
                {
                    id: answerMessageId,
                    nonce: `dev-ui-${answerMessageId}`,
                    authorUserId: context.userId,
                    content: 'Yes, that works. Go ahead.',
                    createdAt: context.now,
                    ...(replies.reply ? { reply: replies.reply } : {}),
                },
            ],
        });
    }
    return messageId;
}

import { and, eq, sql } from 'drizzle-orm';
import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import { prepareClaimEvent } from '../claims/claim-events.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import { followAgentThread } from './attention.ts';
import { AgentClaimError } from './claim-error.ts';

type ClaimRecord = typeof messageClaimsTable.$inferSelect;

/**
 * Turns a message the Agent claimed by id into its claim. A message in a
 * Channel or DM becomes a top-level claim; a message inside a Thread becomes a
 * Thread claim, numbered and owned by the Thread's parent and worked in the
 * Thread it sits in. The claim Thread is never created here: a top-level claim
 * an Agent resolves inside one turn leaves no work surface behind.
 */
export async function promoteAgentMessageClaim(
    tx: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    messageId: string
) {
    const place = await claimPlacement(tx, runner, chatId, messageId);
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
        throw new AgentClaimError('That message is not in the selected target.');
    }
    // The update locks the numbering Chat's row, so concurrent claims in a
    // Thread and in its parent draw distinct numbers from the one sequence.
    const [numberedChat] = await tx
        .update(chatsTable)
        .set({ lastClaimNumber: sql`${chatsTable.lastClaimNumber} + 1` })
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, place.chatId)))
        .returning({ number: chatsTable.lastClaimNumber });
    if (!numberedChat) {
        throw new AgentClaimError('That claim target no longer exists.');
    }
    const [claim] = await tx
        .insert(messageClaimsTable)
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
    if (!claim) {
        throw new Error('Claim conversion did not persist.');
    }
    await followClaim(tx, runner, claim, 'fresh');
    const event = prepareClaimEvent({
        chatId: place.chatId,
        messageId,
        serverId: runner.serverId,
        threadChatId: place.threadChatId,
        type: 'claim.created',
    });
    return { event, claim };
}

/**
 * The claimant follows the claim's replies: the inline reply chain of a
 * top-level claim, or the Thread a Thread claim sits in (inline replies do not
 * exist inside a Thread). Re-confirming a claim the Agent already holds
 * leaves its Thread follow alone, so an explicit unfollow survives.
 */
export async function followClaim(
    tx: HausDatabase,
    runner: ResolvedRunner,
    claim: ClaimRecord,
    mode: 'fresh' | 'reconfirm'
) {
    if (claim.threadChatId) {
        if (mode === 'reconfirm') {
            return;
        }
        await followAgentThread(tx, {
            agentId: runner.agentId,
            serverId: runner.serverId,
            threadChatId: claim.threadChatId,
        });
        return;
    }
    await followInlineReplyForMessage(tx, {
        agentId: runner.agentId,
        chatId: claim.chatId,
        messageId: claim.messageId,
        serverId: runner.serverId,
    });
}

/**
 * Where a claimed message's claim lives: its top-level Chat, and its Thread if
 * any. A Thread's anchor sits in the parent, so claiming it through the Thread
 * target makes an ordinary top-level claim.
 */
async function claimPlacement(
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
        throw new AgentClaimError('Claims require a Channel, DM, or Thread.');
    }
    if (chat.kind !== 'thread') {
        return { chatId, threadChatId: null };
    }
    if (!chat.parentChatId) {
        throw new AgentClaimError('That Thread has no parent Channel or DM.');
    }
    if (chat.anchorMessageId === messageId) {
        return { chatId: chat.parentChatId, threadChatId: null };
    }
    return { chatId: chat.parentChatId, threadChatId: chatId };
}

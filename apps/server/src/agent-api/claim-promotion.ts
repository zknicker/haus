import { and, eq, sql } from 'drizzle-orm';

import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import { prepareClaimEvent } from '../claims/claim-events.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import { AgentClaimError } from './claim-error.ts';

type ClaimRecord = typeof messageClaimsTable.$inferSelect;

export async function promoteAgentMessageClaim(
    tx: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    messageId: string
) {
    const [message] = await tx
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.chatId, chatId),
                eq(chatMessagesTable.id, messageId)
            )
        )
        .limit(1);
    if (!message) {
        throw new AgentClaimError('That message is not in the selected target.');
    }
    const [numberedChat] = await tx
        .update(chatsTable)
        .set({ lastClaimNumber: sql`${chatsTable.lastClaimNumber} + 1` })
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .returning({ number: chatsTable.lastClaimNumber });
    if (!numberedChat) {
        throw new AgentClaimError('That claim target no longer exists.');
    }
    const [claim] = await tx
        .insert(messageClaimsTable)
        .values({
            assigneeAgentId: runner.agentId,
            chatId,
            claimedAt: sql`now()`,
            createdByAgentId: runner.agentId,
            messageId,
            number: numberedChat.number,
            origin: 'claimed',
            serverId: runner.serverId,
            status: 'in_progress',
        })
        .returning();
    if (!claim) {
        throw new Error('Claim conversion did not persist.');
    }
    await followClaim(tx, runner, claim);
    const event = prepareClaimEvent({
        chatId,
        messageId,
        serverId: runner.serverId,
        type: 'claim.created',
    });
    return { event, claim };
}

export async function followClaim(tx: HausDatabase, runner: ResolvedRunner, claim: ClaimRecord) {
    await followInlineReplyForMessage(tx, {
        agentId: runner.agentId,
        chatId: claim.chatId,
        messageId: claim.messageId,
        serverId: runner.serverId,
    });
}

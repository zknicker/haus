import type { MessageClaim } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { followAgentTask } from '../agent-api/attention.ts';
import { targetForChat } from '../agent-api/message-view.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { claimAssignmentEnvelope, claimAssignmentKey } from './claim-assignment-envelope.ts';

/**
 * Hands an assigned Agent its typed `claim_assignment` delivery and the
 * follows that keep the claim's replies reaching it. Runs inside the
 * assignment's transaction.
 */
export async function deliverClaimAssignment(
    tx: HausDatabase,
    agentDelivery: AgentDelivery,
    input: {
        agentId: string;
        assignedByHandle: null | string;
        serverId: string;
        claim: MessageClaim;
    }
) {
    const { agentId, serverId, claim } = input;
    await followInlineReplyForMessage(tx, {
        agentId,
        chatId: claim.chatId,
        messageId: claim.messageId,
        serverId,
    });
    const [chat] = await tx
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, claim.chatId)))
        .limit(1);
    if (chat?.kind === 'task') {
        await followAgentTask(tx, { agentId, serverId, taskChatId: claim.chatId });
    }

    // The claim's title is its canonical message's content, and its target is
    const [message] = await tx
        .select({ chatId: chatMessagesTable.chatId, content: chatMessagesTable.content })
        .from(chatMessagesTable)
        .where(
            and(eq(chatMessagesTable.serverId, serverId), eq(chatMessagesTable.id, claim.messageId))
        )
        .limit(1);
    if (!message) {
        throw new Error(`Claim message ${claim.messageId} is missing.`);
    }
    // The handoff is a private Agent delivery, so it is typed pending work and
    // never a Chat message. The delivery key carries the new version: a claim
    // can be reassigned many times.
    await agentDelivery.enqueue(tx, {
        agentId,
        chatId: claim.chatId,
        content: claimAssignmentEnvelope({
            assignedByHandle: input.assignedByHandle,
            number: claim.number,
            target: await targetForChat(tx, serverId, message.chatId),
            title: message.content,
        }),
        dedupeKey: claimAssignmentKey(claim.messageId, claim.version),
        mentioned: true,
        serverId,
        source: 'claim_assignment',
    });
}

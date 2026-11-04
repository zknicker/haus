import { claimChangedTopic } from '../realtime/topics.ts';

/**
 * Prepares `claim.changed` for a claim row the caller is about to commit. The
 * App invalidates the claim Message's entity and `claim.list`, so the event names
 * the Chat the Message sits in: a Thread claim's Thread, whose access follows
 * its parent. `threadChatId` is the claim row's own column, null for a
 * top-level claim.
 */
export function prepareClaimEvent(input: {
    chatId: string;
    messageId: string;
    serverId: string;
    threadChatId: string | null;
    type: 'claim.created' | 'claim.updated';
}) {
    return claimChangedTopic.prepare({
        chatId: input.threadChatId ?? input.chatId,
        kind: input.type === 'claim.created' ? 'created' : 'updated',
        messageId: input.messageId,
        serverId: input.serverId,
    });
}

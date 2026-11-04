import type { ChatMessage, MessageClaim, ThreadSummary } from '@haus/api';
import { serverChatRoute, serverChatThreadRoute } from '../server-routes.ts';

/**
 * Where a claim's work is read, under its parent Channel or DM (`claim.chatId`).
 * A claim on a top-level message opens the Thread anchored on that message. A
 * claim on a message inside a Thread opens the Thread it sits in: Threads never
 * nest, so that message never anchors a Thread of its own and nothing replies
 * to it as one.
 */
export type ClaimThreadTarget =
    | { anchorMessageId: string; kind: 'anchor'; threadChatId: string }
    | {
          /** The top-level message the containing Thread hangs on. */
          anchorMessageId: string;
          kind: 'in-thread';
          claimMessageId: string;
          threadChatId: string;
      };

export interface ClaimThreadSource {
    claim: Pick<MessageClaim, 'chatId' | 'threadChatId'>;
    message: Pick<ChatMessage, 'chatId' | 'id'>;
    /** For a Thread claim, the summary of the Thread the message sits in. */
    threadSummary: Pick<ThreadSummary, 'anchorMessageId'>;
}

/**
 * The claim's Thread, or null when a Thread claim arrives without the anchor of
 * the Thread it sits in: opening the claim message as an anchor would nest.
 */
export function claimThreadTarget({
    message,
    claim,
    threadSummary,
}: ClaimThreadSource): ClaimThreadTarget | null {
    if (!isThreadClaim({ message, claim })) {
        return { anchorMessageId: message.id, kind: 'anchor', threadChatId: claim.threadChatId };
    }
    if (threadSummary.anchorMessageId === message.id) {
        return null;
    }
    return {
        anchorMessageId: threadSummary.anchorMessageId,
        kind: 'in-thread',
        claimMessageId: message.id,
        threadChatId: claim.threadChatId,
    };
}

/**
 * "View in chat": the claim's Channel or DM, opened on the Thread a Thread
 * claim sits in. A top-level claim's message is in the chat itself.
 */
export function claimChatRoute(
    slug: string,
    claim: Pick<ClaimThreadSource['claim'], 'chatId' | 'threadChatId'> & {
        message: ClaimThreadSource['message'];
        threadSummary: ClaimThreadSource['threadSummary'];
    }
): string {
    const target = claimThreadTarget({
        message: claim.message,
        claim,
        threadSummary: claim.threadSummary,
    });
    return target?.kind === 'in-thread'
        ? serverChatThreadRoute(slug, claim.chatId, target.anchorMessageId)
        : serverChatRoute(slug, claim.chatId);
}

/** A Thread claim's message lives in the Thread, not in the claim's Channel or DM. */
export function isThreadClaim({
    message,
    claim,
}: Pick<ClaimThreadSource, 'message' | 'claim'>): boolean {
    return message.chatId !== claim.chatId;
}

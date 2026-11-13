import type { ChatMessage, ClaimListItem, ThreadSummary } from '@haus/api';
import * as React from 'react';
import { useChatMessage } from '../../../hooks/servers/use-chat-message.ts';
import { claimThreadTarget } from './claim-thread-target.ts';

/** A claim opened as its Thread, under the claim's Channel or DM. */
export interface ClaimThread {
    /** The Thread's anchor, a top-level message of the claim's Channel or DM. */
    anchor: ChatMessage;
    /** The claim's message when it sits inside the Thread; null when it anchors it. */
    claimMessage: ChatMessage | null;
    /** Names the opening: two claims in one Thread are two openings. */
    claimMessageId: string;
    summary: ThreadSummary;
    threadChatId: string;
}

/**
 * The Thread a listed claim opens: its own for a top-level claim, the one it
 * sits in for a Thread claim, whose anchor reads (or fetches) its entity.
 * Undefined until that anchor loads, or when the claim names no openable Thread.
 */
export function useClaimThread(
    serverId: string,
    item: ClaimListItem | undefined
): ClaimThread | undefined {
    const target = item ? claimThreadTarget(item) : null;
    const inThread = target?.kind === 'in-thread';
    const anchorEntity = useChatMessage(
        serverId,
        item?.claim.chatId ?? '',
        inThread ? target.anchorMessageId : '',
        { enabled: inThread }
    );
    const anchorMessage = anchorEntity?.message;
    const anchorSummary = anchorEntity?.thread ?? null;

    return React.useMemo(() => {
        const opened = item ? claimThreadTarget(item) : null;
        if (!(item && opened)) {
            return;
        }
        // The claim-list message may omit the claim projection; the Thread's
        // header and metadata key off it, so attach it explicitly.
        const message = { ...item.message, claim: item.claim };
        if (opened.kind === 'anchor') {
            return {
                anchor: message,
                summary: item.threadSummary,
                claimMessage: null,
                claimMessageId: message.id,
                threadChatId: opened.threadChatId,
            };
        }
        if (!anchorMessage) {
            return;
        }
        return {
            anchor: anchorMessage,
            summary: anchorSummary ?? item.threadSummary,
            claimMessage: message,
            claimMessageId: message.id,
            threadChatId: opened.threadChatId,
        };
    }, [anchorMessage, anchorSummary, item]);
}

import {
    type ActiveCloudAgentWork,
    type ActiveCloudAgentWorkLocation,
    activeCloudAgentWorkThreadAnchor,
    type ChatMessage,
} from '@haus/api';

/**
 * Where opening one active work goes (ADR 0044, Q4): its launch work Thread
 * when the viewer can read it, else the newest linking Message the viewer can
 * see. A Server that predates `location` only ever named the work Thread.
 */
export function activeCloudAgentWorkLocation(
    item: ActiveCloudAgentWork
): ActiveCloudAgentWorkLocation {
    return (
        item.location ?? {
            anchorMessageId: activeCloudAgentWorkThreadAnchor(item).id,
            kind: 'work-thread',
            threadChatId: item.threadChatId,
        }
    );
}

/** What opening one active work shows. */
export type CloudAgentWorkOpenTarget =
    | { kind: 'work-thread' }
    | { kind: 'thread'; threadChatId: string }
    | { chatId: string; kind: 'message'; messageId: string };

/**
 * A `message` location's `chatId` is always the Channel or DM; `threadChatId`
 * is the Thread the Message sits in or anchors. Either way that Thread is what
 * opens: an in-Thread Message is never revealed in the Channel transcript.
 */
export function cloudAgentWorkOpenTarget(
    location: ActiveCloudAgentWorkLocation
): CloudAgentWorkOpenTarget {
    if (location.kind === 'work-thread') {
        return { kind: 'work-thread' };
    }
    if (location.threadChatId) {
        return { kind: 'thread', threadChatId: location.threadChatId };
    }
    return { chatId: location.chatId, kind: 'message', messageId: location.messageId };
}

/** The work Thread's anchor when the active row already carries it, so the peek needs no read. */
export function carriedWorkThreadAnchor(
    item: ActiveCloudAgentWork,
    anchorMessageId: string
): ChatMessage | undefined {
    return [item.threadAnchorMessage, item.message].find(
        (message): message is ChatMessage => message?.id === anchorMessageId
    );
}

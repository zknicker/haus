import type { ActiveCloudAgentWorkLocation } from '@haus/api';

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

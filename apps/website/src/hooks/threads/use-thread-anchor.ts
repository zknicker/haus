import type { ChatMessage, ThreadSummary } from '@haus/api';
import { useChat } from '../servers/use-chat.ts';
import { useChatMessages } from '../servers/use-chat-messages.ts';
import { useThreadAnchorMessage } from './use-thread-anchor-message.ts';

export interface ThreadAnchor {
    anchor: ChatMessage | undefined;
    chat: ReturnType<typeof useChat>['data'];
    /** The chat or the anchor message is gone (deleted, or no longer visible to the viewer). */
    missing: boolean;
    summary: ThreadSummary | null;
}

/**
 * A Thread addressed by ids alone (a Thread tab, a deep link): its parent
 * chat, anchor message, and summary. The anchor is read live from the parent
 * chat's loaded transcript, so it follows realtime changes; an anchor older
 * than the loaded pages is fetched around its id instead.
 */
export function useThreadAnchor(
    serverId: string,
    chatId: string,
    anchorMessageId: string
): ThreadAnchor {
    const chat = useChat(serverId, chatId);
    const parent = useChatMessages(serverId, chatId);
    const loaded = parent.data?.messages.find((message) => message.id === anchorMessageId);
    const around = useThreadAnchorMessage(
        serverId,
        chatId,
        parent.data !== undefined && !loaded ? anchorMessageId : null
    );
    const summary =
        [...(parent.data?.threads ?? []), ...(around.data?.threads ?? [])].find(
            (thread) => thread.anchorMessageId === anchorMessageId
        ) ?? null;
    const missing =
        chat.error?.data?.code === 'NOT_FOUND' || around.error?.data?.code === 'NOT_FOUND';
    return { anchor: loaded ?? around.anchor, chat: chat.data, missing, summary };
}

import type { ChatMessage, ThreadSummary } from '@haus/api';
import { useChat } from '../servers/use-chat.ts';
import { useChatMessage } from '../servers/use-chat-message.ts';

export interface ThreadAnchor {
    anchor: ChatMessage | undefined;
    chat: ReturnType<typeof useChat>['data'];
    /** The chat or the anchor message is gone (deleted, or no longer visible to the viewer). */
    missing: boolean;
    summary: ThreadSummary | null;
}

/**
 * A Thread addressed by ids alone (a Thread tab, a deep link): its parent
 * chat, anchor message, and summary. The anchor is its `chat.message`
 * entity, seeded by any loaded parent transcript and fetched by id otherwise,
 * so it follows realtime changes wherever the anchor sits in history.
 */
export function useThreadAnchor(
    serverId: string,
    chatId: string,
    anchorMessageId: string
): ThreadAnchor {
    const chat = useChat(serverId, chatId);
    const entity = useChatMessage(serverId, chatId, anchorMessageId);
    const missing = chat.error?.data?.code === 'NOT_FOUND' || entity === null;
    return {
        anchor: entity?.message,
        chat: chat.data,
        missing,
        summary: entity?.thread ?? null,
    };
}

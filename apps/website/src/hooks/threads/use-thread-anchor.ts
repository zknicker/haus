import type { ChatMessage, ThreadSummary } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useChat } from '../servers/use-chat.ts';
import { useChatMessages } from '../servers/use-chat-messages.ts';

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
    const around = hausTrpc.chat.messages.useQuery(
        { aroundMessageId: anchorMessageId, chatId, limit: 1, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: parent.data !== undefined && !loaded }
    );
    const fetched = around.data?.messages.find((message) => message.id === anchorMessageId);
    const summary =
        [...(parent.data?.threads ?? []), ...(around.data?.threads ?? [])].find(
            (thread) => thread.anchorMessageId === anchorMessageId
        ) ?? null;
    const missing =
        chat.error?.data?.code === 'NOT_FOUND' || around.error?.data?.code === 'NOT_FOUND';
    return { anchor: loaded ?? fetched, chat: chat.data, missing, summary };
}

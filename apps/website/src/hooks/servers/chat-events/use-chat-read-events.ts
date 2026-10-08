import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { chatReadChangesList } from '../chat-read-cache.ts';
import type { ChatEventInvalidation } from './chat-event-invalidation.ts';
import { useChatEvent } from './use-chat-event-stream.tsx';

/**
 * A read moves unread counts, and `chat.list` is where they render — the
 * sidebar, the Inbox's Unread section, and its badge. The transcript itself is
 * left alone. A read only lowers counts, so one whose list rows already show
 * zero (and were not zeroed ahead of the Server here) refetches nothing.
 */
export function useChatReadEvents() {
    const utils = hausTrpc.useUtils();
    const queryClient = useQueryClient();

    useChatEvent('chat.read', async (events, serverId) => {
        await invalidateChatRead({ events, queryClient, serverId, utils });
    });
}

export async function invalidateChatRead({
    events,
    queryClient,
    serverId,
    utils,
}: ChatEventInvalidation<'chat.read'>) {
    // A Thread's unread replies roll up into its parent Chat's list row.
    const rowIds = [...new Set(events.map((event) => event.parentChatId ?? event.chatId))];
    if (chatReadChangesList({ queryClient, rowIds, serverId, utils })) {
        await utils.chat.list.invalidate({ serverId });
    }
}

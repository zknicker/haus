import { hausTrpc } from '../../../lib/haus-server.tsx';
import type { ChatEventInvalidation } from './chat-event-invalidation.ts';
import { useChatEvent } from './use-chat-event-stream.tsx';

/**
 * A read moves unread counts, and `chat.list` is where they render — the
 * sidebar, the Inbox's Unread section, and its badge. The transcript itself is
 * left alone.
 */
export function useChatReadEvents() {
    const utils = hausTrpc.useUtils();

    useChatEvent('chat.read', async (_events, serverId) => {
        await invalidateChatRead({ serverId, utils });
    });
}

export async function invalidateChatRead({
    serverId,
    utils,
}: Pick<ChatEventInvalidation<'chat.read'>, 'serverId' | 'utils'>) {
    await utils.chat.list.invalidate({ serverId });
}

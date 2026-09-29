import { hausTrpc } from '../../../lib/haus-server.tsx';
import { type ChatEventInvalidation, uniqueChatIds } from './chat-event-invalidation.ts';
import { useChatEvent } from './use-chat-event-stream.tsx';

/**
 * Creating, renaming, retiring, or deleting a Chat moves the active and
 * archived lists, that Chat's own snapshot, Agent chat rows — the viewer's
 * visible Chats filtered by Agent membership — and Needs you, which drops an
 * archived or deleted Chat's rows.
 */
export function useChatLifecycleEvents() {
    const utils = hausTrpc.useUtils();

    useChatEvent('chat.lifecycle', async (events, serverId) => {
        await invalidateChatLifecycle({ events, serverId, utils });
    });
}

export async function invalidateChatLifecycle({
    events,
    serverId,
    utils,
}: Omit<ChatEventInvalidation<'chat.lifecycle'>, 'queryClient'>) {
    const lifecycleChatIds = uniqueChatIds(events.map((event) => event.chatId));

    await Promise.all([
        utils.chat.list.invalidate({ serverId }),
        utils.agent.chats.invalidate({ serverId }),
        utils.chat.listArchived.invalidate({ serverId }),
        utils.inbox.needsYou.invalidate({ serverId }),
        ...lifecycleChatIds.map((chatId) => utils.chat.get.invalidate({ chatId, serverId })),
    ]);
}

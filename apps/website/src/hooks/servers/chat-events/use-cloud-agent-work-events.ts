import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { threadMessagesQueryKey } from '../use-thread-messages.ts';
import { type ChatEventInvalidation, uniqueChatIds } from './chat-event-invalidation.ts';
import { useChatEvent } from './use-chat-event-stream.tsx';

/**
 * A Cloud Agent work that changed moves two reads: the active-work list behind
 * the Inbox, and the transcript carrying the work Message whose header states
 * the new status. Work launched inside a Thread also refetches its parent
 * Chat, because the Message shows there through the Thread preview.
 */
export function useCloudAgentWorkEvents() {
    const queryClient = useQueryClient();
    const utils = hausTrpc.useUtils();

    useChatEvent('cloud-agent-work.updated', async (events, serverId) => {
        await invalidateCloudAgentWorkChanges({ events, queryClient, serverId, utils });
    });
}

export async function invalidateCloudAgentWorkChanges({
    events,
    queryClient,
    serverId,
    utils,
}: ChatEventInvalidation<'cloud-agent-work.updated'>) {
    const chatIds = uniqueChatIds(
        events.flatMap((event) =>
            event.parentChatId ? [event.chatId, event.parentChatId] : [event.chatId]
        )
    );

    // A Chat's work list never stales on a timer (`queryPolicy.pushedSnapshot`)
    // and is warmed by hover prefetch, so an older request still in flight
    // must not land after this pass and erase the stale mark.
    await Promise.all(
        chatIds.map((chatId) => utils.cloudAgentWork.listForChat.cancel({ chatId, serverId }))
    );

    await Promise.all([
        utils.cloudAgentWork.listActive.invalidate({ serverId }),
        ...chatIds.map((chatId) =>
            utils.cloudAgentWork.listForChat.invalidate({ serverId, chatId })
        ),
        ...chatIds.map((chatId) => utils.chat.messages.invalidate({ chatId, serverId })),
        ...uniqueChatIds(events.map((event) => event.chatId)).map((chatId) =>
            queryClient.invalidateQueries({ queryKey: threadMessagesQueryKey(serverId, chatId) })
        ),
    ]);
}

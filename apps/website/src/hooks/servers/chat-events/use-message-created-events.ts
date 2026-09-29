import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { threadMessagesQueryKey } from '../use-thread-messages.ts';
import {
    type ChatEventInvalidation,
    type ChatEventUtils,
    uniqueChatIds,
} from './chat-event-invalidation.ts';
import type { ChatEventOf } from './chat-event-registry.ts';
import { useChatEvent } from './use-chat-event-stream.tsx';

/**
 * A new message moves the transcript it landed in, the Thread transcript of the
 * same Chat, its parent summary when it is a Thread reply, Chat ordering,
 * Server search, and — only when a message could address or answer for the
 * viewer — their Needs you rows.
 */
export function useMessageCreatedEvents() {
    const queryClient = useQueryClient();
    const utils = hausTrpc.useUtils();

    useChatEvent('message.created', async (events, serverId) => {
        await invalidateMessageCreated({ events, queryClient, serverId, utils });
    });
}

export async function invalidateMessageCreated({
    events,
    queryClient,
    serverId,
    utils,
}: ChatEventInvalidation<'message.created'>) {
    const messageChatIds = uniqueChatIds(
        events.flatMap((event) =>
            event.parentChatId ? [event.chatId, event.parentChatId] : [event.chatId]
        )
    );
    const threadChatIds = uniqueChatIds(events.map((event) => event.chatId));

    // Inactive reads are not refetched by invalidation. Cancel older requests
    // first so their late responses cannot erase the stale mark before remount.
    await Promise.all([
        ...messageChatIds.map((chatId) => utils.chat.messages.cancel({ chatId, serverId })),
        ...threadChatIds.map((chatId) =>
            queryClient.cancelQueries({ queryKey: threadMessagesQueryKey(serverId, chatId) })
        ),
    ]);

    await Promise.all([
        utils.chat.list.invalidate({ serverId }),
        utils.chat.search.invalidate({ serverId }),
        ...(events.some((event) => mayChangeNeedsYou(event, utils, serverId))
            ? [utils.inbox.needsYou.invalidate({ serverId })]
            : []),
        ...messageChatIds.map((chatId) => utils.chat.messages.invalidate({ chatId, serverId })),
        ...threadChatIds.map((chatId) =>
            queryClient.invalidateQueries({ queryKey: threadMessagesQueryKey(serverId, chatId) })
        ),
    ]);
}

/**
 * Needs you (ADR 0037) changes only for a message in the viewer's DM, one that
 * mentions them, inline-replies to their message, or lands in a Thread on their
 * message, or one they wrote (a reply that can clear a row). Unknown
 * viewer or Chat refetches, so a cold cache never hides a row.
 */
export function mayChangeNeedsYou(
    event: ChatEventOf<'message.created'>,
    utils: Pick<ChatEventUtils, 'chat' | 'member'>,
    serverId: string
): boolean {
    const viewerUserId = utils.member.list.getData({ serverId })?.viewerUserId;
    if (
        viewerUserId === undefined ||
        event.authorUserId === viewerUserId ||
        event.mentionedUserIds.includes(viewerUserId) ||
        event.replyToAuthorUserId === viewerUserId ||
        event.threadAnchorAuthorUserId === viewerUserId
    ) {
        return true;
    }
    const conversationId = event.parentChatId ?? event.chatId;
    const conversation = utils.chat.list
        .getData({ serverId })
        ?.find((chat) => chat.id === conversationId);
    return conversation?.kind !== 'channel';
}

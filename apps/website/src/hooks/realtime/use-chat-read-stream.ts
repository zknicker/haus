import type { ChatReadEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { readChangesUnreadList } from '../servers/chat-read-cache.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

type ReadUtils = Pick<ReturnType<typeof hausTrpc.useUtils>, 'chat' | 'thread'>;

/**
 * `chat.onRead` (the viewer's own reads). A Chat read refreshes `chat.list`;
 * a Thread read refreshes `thread.listUnread` and its anchor's summary
 * (per-viewer unread count) — a Thread is unread on its own (ADR 0043). Each
 * skips the list when its settled row already shows the read; a read that
 * moves a list also refreshes the Inbox's unread previews. `onEvent` hears
 * each live read (message notifications).
 */
export function useChatReadStream(
    serverId: string | undefined,
    onEvent?: (event: ChatReadEvent) => void
) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const utils = hausTrpc.useUtils();
    const latestOnEvent = React.useRef(onEvent);
    React.useLayoutEffect(() => {
        latestOnEvent.current = onEvent;
    });
    const stream = useSubscriptionRestart('chat.onRead', serverId, () => {
        if (serverId) {
            coalescer.recoverTranscriptLists({ serverId });
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.list, { serverId }) });
            coalescer.invalidate({
                queryKey: getQueryKey(hausTrpc.thread.listUnread, { serverId }),
            });
            coalescer.invalidate({
                queryKey: getQueryKey(hausTrpc.chat.unreadPreviews, { serverId }),
            });
        }
    });

    const { reset } = hausTrpc.chat.onRead.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => {
                applyChatRead({ coalescer, event, queryClient, utils });
                latestOnEvent.current?.(event);
            },
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyChatRead({
    coalescer,
    event,
    queryClient,
    utils,
}: {
    coalescer: TargetedReadCoalescer;
    event: ChatReadEvent;
    queryClient: QueryClient;
    utils: ReadUtils;
}) {
    const { chatId, serverId } = event;
    const list = event.parentChatId ? 'threads' : 'chats';
    if (readChangesUnreadList({ chatId, list, queryClient, serverId, utils })) {
        coalescer.invalidate({
            queryKey:
                list === 'chats'
                    ? getQueryKey(hausTrpc.chat.list, { serverId })
                    : getQueryKey(hausTrpc.thread.listUnread, { serverId }),
        });
        // A read short of the newest message leaves the row with fewer waiting messages.
        coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.unreadPreviews, { serverId }) });
    }
    if (event.parentChatId && event.threadAnchorMessageId) {
        coalescer.noteMessageAnnotated({
            chatId: event.parentChatId,
            messageId: event.threadAnchorMessageId,
            serverId,
        });
    }
}

import type { ChatReadEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { chatReadChangesList } from '../servers/chat-read-cache.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

type ReadUtils = Pick<ReturnType<typeof hausTrpc.useUtils>, 'chat'>;

/**
 * `chat.onRead` (the viewer's own reads): unread counts render from
 * `chat.list`, skipped when the settled list already shows zero for the row.
 * A Thread read also refreshes its anchor's summary (per-viewer unread count).
 * `onEvent` hears each live read (message notifications).
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
    const { serverId } = event;
    // A Thread's unread replies roll up into its parent Chat's list row.
    const rowIds = [event.parentChatId ?? event.chatId];
    if (chatReadChangesList({ queryClient, rowIds, serverId, utils })) {
        coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.list, { serverId }) });
    }
    if (event.parentChatId && event.threadAnchorMessageId) {
        coalescer.noteMessageAnnotated({
            chatId: event.parentChatId,
            messageId: event.threadAnchorMessageId,
            serverId,
        });
    }
}

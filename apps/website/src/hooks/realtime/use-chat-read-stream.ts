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
import { refreshTaskReads } from './task-reads.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

type ReadUtils = Pick<ReturnType<typeof hausTrpc.useUtils>, 'chat'>;

/**
 * `chat.onRead` (the viewer's own reads). A Channel or DM read refreshes
 * `chat.list`, skipped when its settled row already shows the read; a Task
 * read refreshes its Task's reads. Either refreshes the Inbox's unread
 * previews. `onEvent` hears each live read (message notifications).
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
    // A Task's Chat is in no Chat list: its unread lives on its detail, its origin
    // preview, and its Inbox row (ADR 0053 decision 9).
    if (event.taskId) {
        refreshTaskReads(coalescer, queryClient, { serverId, taskId: event.taskId });
        coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.unreadPreviews, { serverId }) });
        return;
    }
    if (readChangesUnreadList({ chatId, queryClient, serverId, utils })) {
        coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.list, { serverId }) });
        // A read short of the newest message leaves the row with fewer waiting messages.
        coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.unreadPreviews, { serverId }) });
    }
}

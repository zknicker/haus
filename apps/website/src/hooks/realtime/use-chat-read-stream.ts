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

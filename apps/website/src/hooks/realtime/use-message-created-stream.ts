import type { MessageCreatedEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { refreshTaskReads } from './task-reads.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `chat.onMessageCreated` for the active Server: tail-read every cached
 * transcript list of the Chat (a Task message also refreshes its Task's reads),
 * and invalidate Chat ordering and search. `onEvent` hears each live event
 * (message notifications); a start's recovery reads never reach it.
 */
export function useMessageCreatedStream(
    serverId: string | undefined,
    onEvent?: (event: MessageCreatedEvent) => void
) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const latestOnEvent = React.useRef(onEvent);
    React.useLayoutEffect(() => {
        latestOnEvent.current = onEvent;
    });
    const stream = useSubscriptionRestart('chat.onMessageCreated', serverId, () => {
        if (serverId) {
            recoverMessageCreatedReads(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.chat.onMessageCreated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => {
                applyMessageCreated(coalescer, queryClient, event);
                latestOnEvent.current?.(event);
            },
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyMessageCreated(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    event: MessageCreatedEvent
) {
    coalescer.noteMessageCreated(event);
    if (event.taskId) {
        refreshTaskReads(coalescer, queryClient, {
            serverId: event.serverId,
            taskId: event.taskId,
        });
    }
    invalidateChatListAndSearch(coalescer, event.serverId);
    // Any message can join an unread row's waiting messages (ADR 0050).
    invalidateUnreadPreviews(coalescer, event.serverId);
}

/**
 * Owned reads on every start: every cached transcript list, Chat ordering,
 * search, and the Inbox's unread previews. A list, not a tail read: a missed
 * Task message changes its origin Message's preview, which only the origin
 * list's reread reseeds.
 */
export function recoverMessageCreatedReads(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.recoverTranscriptLists({ serverId });
    invalidateChatListAndSearch(coalescer, serverId);
    invalidateUnreadPreviews(coalescer, serverId);
}

function invalidateUnreadPreviews(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.unreadPreviews, { serverId }) });
}

function invalidateChatListAndSearch(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.search, { serverId }) });
}

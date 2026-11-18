import type { TaskCreatedEvent, TaskDetail } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import type { HausClient } from '../../lib/transcript-list-reads.ts';
import { taskDetailKeys } from '../tasks/task-cache.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `task.onCreated`: the Tasks page's lists, the sidebar's open Tasks, and the
 * origin Message's preview. An Agent starts a Task from a Message that is
 * usually already on screen, so no message stream rereads it: the stream
 * reads the new Task's origin and refreshes that one Message's entity, whose
 * `chat.message` answer carries the preview the entity owns. The
 * preview shows from the start, before the Task has a message of its own. A
 * start reconciles the lists; previews ride the transcript recovery.
 */
export function useTaskCreatedStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const { client } = hausTrpc.useUtils();
    const stream = useSubscriptionRestart('task.onCreated', serverId, () => {
        if (serverId) {
            invalidateTaskLists(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.task.onCreated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyTaskCreated(coalescer, queryClient, client, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyTaskCreated(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    client: HausClient,
    event: TaskCreatedEvent
) {
    invalidateTaskLists(coalescer, event.serverId);
    void refreshTaskOrigin(coalescer, queryClient, client, event).catch((error: unknown) => {
        // The preview then waits for the origin Chat's next read; the lists are current.
        console.error('[haus] Could not read a new Task to show its preview', error);
    });
}

/**
 * The new Task's origin Message, refreshed in place. Nothing reads while no
 * transcript is loaded, since no row could show the preview.
 */
async function refreshTaskOrigin(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    client: HausClient,
    { serverId, taskId }: TaskCreatedEvent
) {
    if (coalescer.lists.lists({ serverId }).length === 0) {
        return;
    }
    const origin =
        cachedOrigin(queryClient, serverId, taskId) ??
        (await client.task.get.query({ serverId, taskId })).origin;
    if (origin) {
        coalescer.noteMessageAnnotated({
            chatId: origin.chatId,
            messageId: origin.messageId,
            serverId,
        });
    }
}

function cachedOrigin(queryClient: QueryClient, serverId: string, taskId: string) {
    const [key] = taskDetailKeys(queryClient, serverId, (task) => task.id === taskId);
    return key ? (queryClient.getQueryData<TaskDetail>(key)?.origin ?? null) : null;
}

function invalidateTaskLists(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.listOpen, { serverId }) });
}

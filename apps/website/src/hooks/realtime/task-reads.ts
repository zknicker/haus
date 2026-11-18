import type { TaskDetail } from '@haus/api';
import type { QueryClient } from '@tanstack/react-query';
import type { TargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { taskDetailKeys } from '../tasks/task-cache.ts';
import { findTaskPreviewOrigin } from '../tasks/task-preview-cache.ts';

/**
 * A Task's cached detail and its origin Channel's preview, after its
 * conversation, unread, follow, or state changed. The preview rides the
 * origin Chat's transcript pages (`task-preview-cache.ts`), so the loaded
 * pages of that one Chat reread; nothing rereads while no preview or detail
 * names the origin, since no rendered row shows the Task there.
 */
export function refreshTaskReads(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    { serverId, taskId }: { serverId: string; taskId: string }
) {
    let originChatId = findTaskPreviewOrigin(queryClient, serverId, taskId);
    for (const queryKey of taskDetailKeys(queryClient, serverId, (task) => task.id === taskId)) {
        originChatId ??= queryClient.getQueryData<TaskDetail>(queryKey)?.origin?.chatId ?? null;
        coalescer.invalidate({ exact: true, queryKey });
    }
    if (originChatId) {
        coalescer.recoverTranscriptLists({ chatIds: [originChatId], serverId });
    }
}

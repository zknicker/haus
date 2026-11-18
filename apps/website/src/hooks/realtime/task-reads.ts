import type { TaskDetail } from '@haus/api';
import type { QueryClient } from '@tanstack/react-query';

import type { TargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { taskDetailKeys } from '../tasks/task-cache.ts';
import { findTaskPreviewOrigin } from '../tasks/task-preview-cache.ts';

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

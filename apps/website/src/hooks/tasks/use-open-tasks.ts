import type { Task } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { openTaskIds } from './open-task-order.ts';

/** What one sidebar row draws of its Task. */
export type OpenTaskEntry = Pick<Task, 'chatId' | 'id' | 'key' | 'state' | 'title'>;

/**
 * The sidebar's open Tasks (`task.listOpen`, ADR 0053 decision 8), as ids in
 * row order; undefined until the read settles. Each row reads its own entry,
 * so a retitle re-renders one row, not the section. `task.onUpdated`
 * invalidates the read, which is how a closed Task leaves.
 */
export function useOpenTaskIds(serverId: string): readonly string[] | undefined {
    const { data } = hausTrpc.task.listOpen.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: openTaskIds }
    );
    return data;
}

export function useOpenTaskEntry(serverId: string, taskId: string): OpenTaskEntry | undefined {
    const select = React.useCallback(
        (tasks: Task[]): OpenTaskEntry | undefined => {
            const task = tasks.find((candidate) => candidate.id === taskId);
            return task
                ? {
                      chatId: task.chatId,
                      id: task.id,
                      key: task.key,
                      state: task.state,
                      title: task.title,
                  }
                : undefined;
        },
        [taskId]
    );
    const { data } = hausTrpc.task.listOpen.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select }
    );
    return data;
}

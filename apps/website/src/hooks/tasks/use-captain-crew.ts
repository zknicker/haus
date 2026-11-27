import type { Task } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function crewTaskListInput(serverId: string) {
    return { serverId };
}

export function useCaptainCrew(serverId: string, agentId: string) {
    const select = React.useCallback(
        (tasks: Task[]) =>
            tasks
                .filter(
                    (task) =>
                        task.captainId === agentId ||
                        (task.createdBy.kind === 'agent' && task.createdBy.agentId === agentId)
                )
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        [agentId]
    );
    return hausTrpc.task.list.useQuery(crewTaskListInput(serverId), {
        ...queryPolicy.syncedSnapshot,
        select,
    }).data;
}

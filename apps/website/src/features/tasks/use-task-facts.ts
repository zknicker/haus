import * as React from 'react';
import { useIssueList } from '../../hooks/issues/use-issue-list.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useModelConnections } from '../../hooks/servers/use-model-connections.ts';
import { computerLabel } from '../computers/presentation.ts';

export function useMachineLabels(serverId: string) {
    const computers = useComputers(serverId).data;
    return React.useMemo(
        () => new Map((computers ?? []).map((computer) => [computer.id, computerLabel(computer)])),
        [computers]
    );
}

export function useModelLabels(serverId: string) {
    const runtimes = useModelConnections(serverId).data?.runnerModels;
    return React.useMemo(
        () =>
            new Map(
                (runtimes ?? []).flatMap((runtime) =>
                    runtime.models.map((model) => [model.id, model.label] as const)
                )
            ),
        [runtimes]
    );
}

export function useTaskIssueCodes(serverId: string, options: { enabled?: boolean } = {}) {
    const issues = useIssueList(serverId, {}, options).data;
    return React.useMemo(() => {
        const codes = new Map<string, string>();
        for (const issue of issues ?? []) {
            for (const taskId of issue.taskIds) {
                codes.set(
                    taskId,
                    codes.has(taskId) ? `${codes.get(taskId)}, ${issue.code}` : issue.code
                );
            }
        }
        return codes;
    }, [issues]);
}

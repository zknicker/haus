import type { Issue, IssuePatch } from '@haus/api';
import { toast } from '@heroui/react';
import { useUpdateIssue } from '../../hooks/issues/use-issue-mutations.ts';

export type IssueVersion = Pick<Issue, 'id' | 'serverId' | 'version'>;

export function useIssuePatch() {
    const update = useUpdateIssue();
    return (
        issue: IssueVersion,
        patch: IssuePatch,
        options?: { onSettled?: () => void; onSuccess?: () => void }
    ) => {
        void update
            .mutateAsync({
                expectedVersion: issue.version,
                issueId: issue.id,
                patch,
                serverId: issue.serverId,
            })
            .then(() => options?.onSuccess?.(), showIssueUpdateError)
            .finally(() => options?.onSettled?.());
    };
}

export function showIssueUpdateError(error: { message: string }) {
    toast.danger('Issue update failed', { description: error.message });
}

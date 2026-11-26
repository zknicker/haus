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
    ) =>
        update.mutate(
            {
                expectedVersion: issue.version,
                issueId: issue.id,
                patch,
                serverId: issue.serverId,
            },
            {
                onError: showIssueUpdateError,
                onSettled: options?.onSettled,
                onSuccess: options?.onSuccess,
            }
        );
}

export function showIssueUpdateError(error: { message: string }) {
    toast.danger('Issue update failed', { description: error.message });
}

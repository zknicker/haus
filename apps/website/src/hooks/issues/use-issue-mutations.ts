import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { issueDetailKeys, writeIssueResult } from './issue-cache.ts';

export function useUpdateIssue() {
    const queryClient = useQueryClient();
    return hausTrpc.issue.update.useMutation({
        onSuccess: ({ issue }) => writeIssueResult(queryClient, issue),
    });
}

export function useCreateIssue() {
    return hausTrpc.issue.create.useMutation();
}

export function useCommentIssue() {
    const queryClient = useQueryClient();
    return hausTrpc.issue.comment.useMutation({
        onSuccess: ({ comment }, { serverId }) => {
            for (const queryKey of issueDetailKeys(
                queryClient,
                serverId,
                (detail) => detail.issue.id === comment.issueId
            )) {
                void queryClient.invalidateQueries({ exact: true, queryKey });
            }
        },
    });
}

export function useSetIssueSubscription() {
    return hausTrpc.issue.setSubscription.useMutation();
}

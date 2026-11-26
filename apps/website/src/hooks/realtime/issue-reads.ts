import type { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { TargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { detailHoldsIssue, issueDetailKeys } from '../issues/issue-cache.ts';

export function refreshIssueReads(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    { issueId, serverId }: { issueId: string; serverId: string }
) {
    for (const queryKey of issueDetailKeys(queryClient, serverId, detailHoldsIssue(issueId))) {
        coalescer.invalidate({ exact: true, queryKey });
    }
    invalidateIssueLists(coalescer, serverId);
}

export function invalidateIssueLists(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.issue.list, { serverId }) });
}

export function invalidateIssueDetails(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.issue.get, { serverId }) });
}

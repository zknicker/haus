import type { Issue, IssueDetail } from '@haus/api';
import type { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';

export function issueDetailKeys(
    queryClient: QueryClient,
    serverId: string,
    matches: (detail: IssueDetail) => boolean
) {
    return detailQueries(queryClient, serverId)
        .filter((query) => {
            const detail = query.state.data as IssueDetail | undefined;
            return detail !== undefined && matches(detail);
        })
        .map((query) => query.queryKey);
}

export function detailHoldsIssue(issueId: string) {
    return (detail: IssueDetail) =>
        detail.issue.id === issueId || detail.subIssues.some((sub) => sub.id === issueId);
}

export function writeIssueResult(queryClient: QueryClient, issue: Issue) {
    const fresher = (cached: Issue) => cached.id === issue.id && cached.version <= issue.version;
    for (const query of listQueries(queryClient, issue.serverId)) {
        const list = query.state.data as Issue[] | undefined;
        if (list?.some(fresher)) {
            queryClient.setQueryData<Issue[]>(
                query.queryKey,
                list.map((item) => (item.id === issue.id ? issue : item))
            );
        }
    }
    for (const query of detailQueries(queryClient, issue.serverId)) {
        const detail = query.state.data as IssueDetail | undefined;
        if (detail && fresher(detail.issue)) {
            queryClient.setQueryData<IssueDetail>(query.queryKey, { ...detail, issue });
        }
    }
}

function listQueries(queryClient: QueryClient, serverId: string) {
    return queryClient
        .getQueryCache()
        .findAll({ queryKey: getQueryKey(hausTrpc.issue.list, { serverId }) });
}

function detailQueries(queryClient: QueryClient, serverId: string) {
    return queryClient
        .getQueryCache()
        .findAll({ queryKey: getQueryKey(hausTrpc.issue.get, { serverId }) });
}

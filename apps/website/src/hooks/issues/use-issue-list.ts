import type { IssueListInput } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export type IssueListFilters = Omit<IssueListInput, 'serverId'>;

export function useIssueList(
    serverId: string,
    filters: IssueListFilters,
    options: { enabled?: boolean } = {}
) {
    const { data, error } = hausTrpc.issue.list.useQuery(
        { ...filters, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: options.enabled }
    );
    return { data, error };
}

export function useIssueDetail(serverId: string, code: string | null) {
    const { data, error } = hausTrpc.issue.get.useQuery(
        { code: code ?? 'X-1', serverId },
        { ...queryPolicy.syncedSnapshot, enabled: code !== null }
    );
    return { data, error };
}

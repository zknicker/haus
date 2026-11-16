import type { TaskInboxList } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** The reader's uncleared Task assignments on this Server, newest first: one read for the feed. */
export function useTaskInboxItems(serverId: string | undefined) {
    return hausTrpc.taskInbox.list.useQuery(
        { serverId: serverId ?? '' },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: serverId !== undefined,
            select: selectItems,
        }
    );
}

function selectItems({ items }: TaskInboxList) {
    return items;
}

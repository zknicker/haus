import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** The Server's unarchived boards in creation order, each with its columns and open count. */
export function useBoards(serverId: string | undefined) {
    return hausTrpc.board.list.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined }
    );
}

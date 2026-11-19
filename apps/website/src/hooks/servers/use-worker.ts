import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useChatWorker(serverId: string, chatId: string) {
    return hausTrpc.worker.listForChat.useQuery({ serverId, chatId }, queryPolicy.syncedSnapshot);
}

/** Every conversation linking these jobs, for the Work panel's Linked from block. */
export function useWorkerLinks(serverId: string, workIds: string[]) {
    return (
        hausTrpc.worker.listLinks.useQuery(
            { serverId, workIds },
            { ...queryPolicy.syncedSnapshot, enabled: workIds.length > 0 }
        ).data ?? []
    );
}

/**
 * Every queued or running Worker the viewer can see on one Server,
 * oldest first. Server membership and Chat access gate the read, so work the
 * viewer cannot see simply never arrives; the Inbox never has to filter a row
 * out. `worker.updated` owns the refresh.
 */
export function useActiveWorker(serverId: string | undefined) {
    return hausTrpc.worker.listActive.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined }
    );
}

/**
 * An Owner or Admin asking the provider to stop. The request is recorded even
 * while the Computer is offline, and the work settles through the ordinary
 * observation path — so this mutation invalidates nothing itself and the
 * surface reads as cancelling until `worker.updated` arrives.
 */
export function useWorkerCancel() {
    return hausTrpc.worker.cancel.useMutation();
}

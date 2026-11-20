import { summarizeWorker } from '../../features/workers/worker-summaries.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useChatWorker(serverId: string, chatId: string) {
    return hausTrpc.worker.listForChat.useQuery({ serverId, chatId }, queryPolicy.syncedSnapshot);
}

/** Every conversation linking these jobs, for the Work panel's Linked from block. */
export function useWorkerLinks(serverId: string, workerIds: string[]) {
    return (
        hausTrpc.worker.listLinks.useQuery(
            { serverId, workerIds },
            { ...queryPolicy.syncedSnapshot, enabled: workerIds.length > 0 }
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

export function useWorkerRecord(serverId: string, workerId: string) {
    return hausTrpc.worker.get.useQuery({ serverId, workerId }, queryPolicy.syncedSnapshot);
}

export function useWorkerSummary(serverId: null | string, workerId: string, enabled: boolean) {
    return hausTrpc.worker.get.useQuery(
        { serverId: serverId ?? '', workerId },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: enabled && serverId !== null,
            select: summarizeWorker,
        }
    ).data;
}

export function useWorkerStop() {
    return hausTrpc.worker.stop.useMutation();
}

export function useWorkerSendFollowUp() {
    return hausTrpc.worker.sendFollowUp.useMutation();
}

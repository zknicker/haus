import type { Worker } from '@haus/api';
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

export function useWorkerSummary(serverId: null | string, workerId: string, enabled: boolean) {
    return hausTrpc.worker.get.useQuery(
        { serverId: serverId ?? '', workerId },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: enabled && serverId !== null,
            select: selectWorkerSummary,
        }
    ).data;
}

function selectWorkerSummary(worker: { id: string; place: Worker['place']; title: string }) {
    return { id: worker.id, place: worker.place, title: worker.title };
}

export function useWorkerStop() {
    return hausTrpc.worker.stop.useMutation();
}

export function useWorkerSendFollowUp() {
    return hausTrpc.worker.sendFollowUp.useMutation();
}

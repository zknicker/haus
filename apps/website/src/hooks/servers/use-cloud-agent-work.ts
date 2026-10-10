import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useChatCloudAgentWork(serverId: string, chatId: string) {
    return hausTrpc.cloudAgentWork.listForChat.useQuery(
        { serverId, chatId },
        queryPolicy.syncedSnapshot
    );
}

/**
 * Every queued or running Cloud Agent work the viewer can see on one Server,
 * oldest first. Server membership and Chat access gate the read, so work the
 * viewer cannot see simply never arrives; the Inbox never has to filter a row
 * out. `cloud-agent-work.updated` owns the refresh.
 */
export function useActiveCloudAgentWork(serverId: string | undefined) {
    return hausTrpc.cloudAgentWork.listActive.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined }
    );
}

/**
 * An Owner or Admin asking the provider to stop. The request is recorded even
 * while the Computer is offline, and the work settles through the ordinary
 * observation path — so this mutation invalidates nothing itself and the
 * surface reads as cancelling until `cloud-agent-work.updated` arrives.
 */
export function useCloudAgentWorkCancel() {
    return hausTrpc.cloudAgentWork.cancel.useMutation();
}

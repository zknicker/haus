import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';

/**
 * The Server's idle compaction setting. The mutation writes its own answer into the read;
 * `server.onUpdated` refreshes every other viewer.
 */
export function useServerIdleCompaction(serverId: string) {
    const utils = hausTrpc.useUtils();
    const settings = hausTrpc.server.settings.useQuery({ serverId }, queryPolicy.syncedSnapshot);
    const mutation = hausTrpc.server.setIdleCompaction.useMutation({
        onSuccess: (next) => utils.server.settings.setData({ serverId }, next),
    });

    return {
        enabled: settings.data?.idleCompaction ?? null,
        isPending: mutation.isPending,
        setEnabled: (idleCompaction: boolean) =>
            withSaveErrorToast(() => mutation.mutateAsync({ idleCompaction, serverId })).catch(
                () => undefined
            ),
    };
}

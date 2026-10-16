import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Refresh teams: re-reads the workspace's team access from Linear now, for an
 * admin who just changed it in Linear. Linear's `PermissionChange` delivery
 * and the hourly sync do the same without a press.
 */
export function useLinearSyncTeams(serverId: string, connectionId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.linear.syncTeams.useMutation({
        onError: (error) => toast.danger('Could not refresh teams', { description: error.message }),
        onSuccess: async () => await utils.linear.workspaces.invalidate({ serverId }),
    });

    return {
        isPending: mutation.isPending,
        syncTeams: () => mutation.mutate({ connectionId, serverId }),
    };
}

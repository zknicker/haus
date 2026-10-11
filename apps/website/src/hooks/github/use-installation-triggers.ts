import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * Every Trigger on the Server, read only while an installation's removal is
 * being confirmed so the dialog can name the Triggers that stop firing.
 */
export function useInstallationTriggers(serverId: string, enabled: boolean) {
    return hausTrpc.trigger.list.useQuery({ serverId }, { ...queryPolicy.syncedSnapshot, enabled });
}

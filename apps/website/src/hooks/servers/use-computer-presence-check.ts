import { useQuery } from '@tanstack/react-query';
import {
    type ComputerPresenceCheck,
    readComputerPresenceCheck,
} from '../../features/updates/computer-presence-gate.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Probes the Server's attached Computers when Haus opens and again whenever it
 * regains focus, then writes the verified list into the `computer.list` cache.
 * A stored attachment can outlive a Computer that went silent; the probe makes
 * the Server reap it before anything offers that Computer an update.
 */
export function useComputerPresenceCheck(
    serverId: string,
    options: { enabled: boolean }
): ComputerPresenceCheck {
    const utils = hausTrpc.useUtils();
    const check = useQuery({
        enabled: options.enabled,
        queryFn: async () => {
            // Unbatched: a silent Computer holds the probe until its timeout.
            const computers = await utils.client.computer.checkPresence.mutate(
                { serverId },
                { context: { skipBatch: true } }
            );
            // A list fetch that started before the probe reaped must not land after it.
            await utils.computer.list.cancel({ serverId });
            utils.computer.list.setData({ serverId }, computers);
            return true;
        },
        queryKey: ['computer-presence-check', serverId],
        refetchOnWindowFocus: true,
        retry: false,
        staleTime: 0,
    });
    // React Query keeps the last successful data through a later pending or failed refetch.
    return readComputerPresenceCheck({ hasVerified: check.data === true, status: check.status });
}

import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

// A cold catalog read fetches publisher icons upstream: its own HTTP request, so it never holds
// the batch carrying `mcp.list` and Connections renders at PostgreSQL speed.
const unbatched = { context: { skipBatch: true } };

export function useConnectionPresetIcons(serverId: string) {
    return hausTrpc.mcp.presetIcons.useQuery(
        { serverId },
        { ...queryPolicy.localConfig, trpc: unbatched }
    );
}

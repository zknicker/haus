import { type ConnectionChipKind, chipConnection } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * Whether this Server's connections add a chat chip. `loading` and `error`
 * still render the chip, so a message never flashes from plain text to chip
 * while the connection list first loads.
 */
export type ChipAvailability = 'absent' | 'available' | 'error' | 'loading';

/** A chip that renders: everything but `absent`. */
export type RenderedChipAvailability = Exclude<ChipAvailability, 'absent'>;

export function useConnectionChip(serverId: string, kind: ConnectionChipKind): ChipAvailability {
    const provided = hausTrpc.mcp.list.useQuery(
        { serverId },
        {
            ...queryPolicy.syncedSnapshot,
            select: (connections) => chipConnection(kind, connections) !== undefined,
        }
    );
    if (provided.data === undefined) {
        return provided.isError ? 'error' : 'loading';
    }
    return provided.data ? 'available' : 'absent';
}

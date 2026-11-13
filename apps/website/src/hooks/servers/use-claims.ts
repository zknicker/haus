import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * The Board and List lens. It hides background-tier claims by default, so a
 * surface that resolves one specific claim by id — a `?claim=` deep link, the
 * claim peek — passes `includeBackground` and reads the widened lens instead.
 */
export function useClaims(
    serverId: string | undefined,
    chatId?: string,
    options?: { enabled?: boolean; includeBackground?: boolean }
) {
    return hausTrpc.claim.list.useQuery(
        // The widening is omitted unless asked for, so the default lens keeps
        // the exact query key the claim mutation caches write through.
        {
            ...(chatId ? { chatId } : {}),
            ...(options?.includeBackground ? { includeBackground: true } : {}),
            serverId: serverId ?? '',
        },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: serverId !== undefined && options?.enabled !== false,
        }
    );
}

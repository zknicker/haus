import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** One Haus server opened at its human-facing address, with its Channels. */
export function useServer(slug: string, enabled = true) {
    return hausTrpc.server.bySlug.useQuery({ slug }, { ...queryPolicy.syncedSnapshot, enabled });
}

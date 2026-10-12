import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** Everyone who has created a live artifact on the Server, most recently active first. */
export function useArtifactCreators(serverId: string) {
    return hausTrpc.artifact.creators.useQuery({ serverId }, queryPolicy.syncedSnapshot);
}

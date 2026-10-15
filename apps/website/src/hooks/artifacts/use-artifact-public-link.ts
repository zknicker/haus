import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One file's public link (`artifact.publicLink`), or null while it has none. `artifact.onUpdated`
 * refreshes it when the link is enabled or disabled anywhere.
 */
export function useArtifactPublicLink(serverId: string, artifactId: string) {
    const query = hausTrpc.artifact.publicLink.useQuery(
        { artifact_id: artifactId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== '' }
    );
    return query.data?.link ?? null;
}

/**
 * Creates (or reuses) and disables public links. Each answer is the file's authoritative link, so
 * it lands in `artifact.publicLink` at once; listings follow through `artifact.onUpdated`.
 */
export function useArtifactPublicLinkMutations(serverId: string) {
    const utils = hausTrpc.useUtils();
    const share = hausTrpc.artifact.share.useMutation({
        onSuccess: (result) =>
            utils.artifact.publicLink.setData(
                { artifact_id: result.artifact_id, serverId },
                result
            ),
    });
    const unshare = hausTrpc.artifact.unshare.useMutation({
        onSuccess: (result) =>
            utils.artifact.publicLink.setData(
                { artifact_id: result.artifact_id, serverId },
                result
            ),
    });
    return {
        /** Resolves to the public url. */
        enable: async (artifactId: string) => {
            const { link } = await share.mutateAsync({ artifact_id: artifactId, serverId });
            if (!link) {
                throw new Error('The Server returned no public link.');
            }
            return link.url;
        },
        disable: async (artifactId: string) => {
            await unshare.mutateAsync({ artifact_id: artifactId, serverId });
        },
    };
}

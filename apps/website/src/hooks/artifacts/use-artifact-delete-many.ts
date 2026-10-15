import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Deletes many shared files in one request (`artifact.deleteMany`). The
 * Server deletes only the files this member may delete and reports the rest.
 * Refreshes the library, the creator list, and open files once it lands.
 */
export function useArtifactDeleteMany(serverId: string) {
    const utils = hausTrpc.useUtils();
    const remove = hausTrpc.artifact.deleteMany.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.artifact.list.invalidate(),
                utils.artifact.creators.invalidate(),
                utils.artifact.get.invalidate(),
            ]);
        },
    });
    return {
        error: remove.error?.message ?? null,
        isPending: remove.isPending,
        removeMany: (artifactIds: readonly string[]) =>
            remove.mutateAsync({ artifact_ids: [...artifactIds], serverId }),
        reset: remove.reset,
    };
}

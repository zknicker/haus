import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Deletes a shared file and every revision (`artifact.delete`); the Server
 * allows its creator or a human Owner/Admin. Refreshes the library, the
 * creator list, and the file's own reads once it lands.
 */
export function useArtifactDelete(serverId: string) {
    const utils = hausTrpc.useUtils();
    const remove = hausTrpc.artifact.delete.useMutation({
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
        remove: (artifactId: string) => remove.mutateAsync({ artifact_id: artifactId, serverId }),
        reset: remove.reset,
    };
}

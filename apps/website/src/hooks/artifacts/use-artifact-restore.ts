import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Restores an older revision (`artifact.restore`): the Server publishes its
 * bytes as a new current revision, so history only grows. The publish's
 * `artifact.onUpdated` refreshes the file's reads; the versions invalidate is
 * only the ack fallback.
 */
export function useArtifactRestore(serverId: string, artifactId: string) {
    const utils = hausTrpc.useUtils();
    const restore = hausTrpc.artifact.restore.useMutation({
        onError: (error) => toast.danger('Could not restore', { description: error.message }),
        onSuccess: (result) => {
            void utils.artifact.versions.invalidate({ artifact_id: artifactId, serverId });
            toast.success(`Restored as revision ${result.artifact.revision_number}`);
        },
    });
    return {
        isPending: restore.isPending,
        pendingRevisionId: restore.isPending ? restore.variables?.revision_id : undefined,
        restore: (revisionId: string) =>
            restore.mutate({ artifact_id: artifactId, revision_id: revisionId, serverId }),
    };
}

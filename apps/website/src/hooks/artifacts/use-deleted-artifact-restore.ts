import type { ArtifactRecord } from '@haus/api';
import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { deletedInput } from './use-artifact-deleted.ts';

export function useDeletedArtifactRestore(serverId: string, folder: string) {
    const utils = hausTrpc.useUtils();
    const restore = hausTrpc.artifact.restore.useMutation({
        onError: (error) => toast.danger('Could not restore', { description: error.message }),
        onSuccess: async (result) => {
            await utils.artifact.listDeleted.invalidate(deletedInput(serverId, folder));
            toast.success(`Restored ${result.artifact.filename}`);
        },
    });
    return {
        pendingArtifactId: restore.isPending ? restore.variables?.artifact_id : undefined,
        restore: (file: Pick<ArtifactRecord, 'artifact_id' | 'revision_id'>) =>
            restore.mutate({
                artifact_id: file.artifact_id,
                revision_id: file.revision_id,
                serverId,
            }),
    };
}

import { hausTrpc } from '../../lib/haus-server.tsx';
import { artifactMoveMessage } from './use-artifact-move.ts';

/** One item to move; a file carries its head so a concurrent publish is not moved blind. */
export type ArtifactMoveItem =
    | { kind: 'file'; path: string; revisionId: string }
    | { kind: 'folder'; path: string };

/**
 * Moves a selection of files and folders into one folder in a single request
 * (`artifact.moveMany`): every item moves or none does. Refreshes the library
 * and any open file once the move lands.
 */
export function useArtifactMoveMany(serverId: string) {
    const utils = hausTrpc.useUtils();
    const move = hausTrpc.artifact.moveMany.useMutation({
        onSuccess: async () => {
            await Promise.all([utils.artifact.list.invalidate(), utils.artifact.get.invalidate()]);
        },
    });
    return {
        error: move.error ? artifactMoveMessage(move.error) : null,
        isPending: move.isPending,
        moveMany: (items: readonly ArtifactMoveItem[], toFolder: string) =>
            move.mutateAsync({
                items: items.map((item) =>
                    item.kind === 'file'
                        ? { base_revision_id: item.revisionId, path: item.path }
                        : { path: item.path }
                ),
                serverId,
                to_folder: toFolder,
            }),
        reset: move.reset,
    };
}

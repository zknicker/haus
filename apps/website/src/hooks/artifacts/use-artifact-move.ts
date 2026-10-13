import { artifactErrorDataSchema } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

const moveMessages: Partial<Record<string, string>> = {
    PATH_CONFLICT: 'That name collides with a file or folder in the way.',
    PATH_TAKEN: 'Something with that name is already here.',
    REVISION_CONFLICT: 'The file changed while you were renaming it. Try again.',
};

/**
 * Renames or moves a drive file or folder (`artifact.move`); only paths
 * change. Refreshes the library and any open file once the move lands.
 */
export function useArtifactMove(serverId: string) {
    const utils = hausTrpc.useUtils();
    const move = hausTrpc.artifact.move.useMutation({
        onSuccess: async () => {
            await Promise.all([utils.artifact.list.invalidate(), utils.artifact.get.invalidate()]);
        },
    });
    const code = artifactErrorDataSchema.safeParse(
        (move.error?.data as { artifact?: unknown } | undefined)?.artifact
    );

    return {
        error: move.error
            ? ((code.success ? moveMessages[code.data.code] : undefined) ?? move.error.message)
            : null,
        isPending: move.isPending,
        move: (input: { base_revision_id?: string; from: string; to: string }) =>
            move.mutateAsync({ ...input, serverId }),
        reset: move.reset,
    };
}

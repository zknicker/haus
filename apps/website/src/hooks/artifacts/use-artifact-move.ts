import { artifactErrorDataSchema } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

const moveMessages: Partial<Record<string, string>> = {
    PATH_CONFLICT: 'That name collides with a file or folder in the way.',
    PATH_TAKEN: 'Something with that name is already here.',
    REVISION_CONFLICT: 'A file changed in the meantime. Try again.',
};

/** A refused move in words: the drive's reason when it names one, else the error's message. */
export function artifactMoveMessage(error: unknown): string {
    const data = (error as { data?: { artifact?: unknown } } | null)?.data;
    const code = artifactErrorDataSchema.safeParse(data?.artifact);
    return (
        (code.success ? moveMessages[code.data.code] : undefined) ??
        (error instanceof Error ? error.message : 'The move failed.')
    );
}

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
    return {
        error: move.error ? artifactMoveMessage(move.error) : null,
        isPending: move.isPending,
        move: (input: { base_revision_id?: string; from: string; to: string }) =>
            move.mutateAsync({ ...input, serverId }),
        reset: move.reset,
    };
}

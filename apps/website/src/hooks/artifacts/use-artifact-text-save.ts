import { useMutation } from '@tanstack/react-query';
import {
    type ArtifactTextSaveInput,
    type ArtifactTextSaveSettled,
    artifactTextSaveOutcome,
} from '../../features/artifacts/artifact-text-edit.ts';
import { getAppSessionAccessToken } from '../../lib/app-auth.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ArtifactRevisionConflictError, publishArtifactFile } from './publish-artifact-file.ts';

export function useArtifactTextSave(serverId: string, artifactId: string) {
    const utils = hausTrpc.useUtils();
    return useMutation({
        mutationFn: async (input: ArtifactTextSaveInput) => {
            const token = getAppSessionAccessToken();
            if (!token) {
                throw new Error('Sign in to save files.');
            }
            const bytes = new TextEncoder().encode(input.text);
            const sentSha256 = await sha256Hex(bytes);
            const settled = await publish(serverId, token, input, bytes);
            return artifactTextSaveOutcome(settled, sentSha256);
        },
        onSuccess: async (outcome) => {
            if (outcome.kind === 'refused') {
                return;
            }
            await Promise.all([
                utils.artifact.get.invalidate({ artifact_id: artifactId, serverId }),
                utils.artifact.versions.invalidate({ artifact_id: artifactId, serverId }),
                utils.artifact.list.invalidate(),
            ]);
        },
    });
}

async function publish(
    serverId: string,
    token: string,
    input: ArtifactTextSaveInput,
    bytes: Uint8Array<ArrayBuffer>
) {
    try {
        const artifact = await publishArtifactFile({
            baseRevisionId: input.base_revision_id,
            file: new Blob([bytes], { type: input.content_type }),
            onProgress: () => undefined,
            path: input.path,
            replace: false,
            serverId,
            token,
        });
        const settled: ArtifactTextSaveSettled = { artifact };
        return settled;
    } catch (error) {
        if (error instanceof ArtifactRevisionConflictError) {
            const settled: ArtifactTextSaveSettled = { conflict: error.conflict };
            return settled;
        }
        throw error;
    }
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

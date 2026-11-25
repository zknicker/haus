import { type ArtifactMetadata, artifactListPageMax } from '@haus/api';
import { toast } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { publishArtifactFile } from '../../hooks/artifacts/publish-artifact-file.ts';
import { getAppSessionAccessToken } from '../../lib/app-auth.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { untitledFileName } from './drive-new-file.ts';

export function useNewDriveFile(serverId: string, onCreated: (artifact: ArtifactMetadata) => void) {
    const utils = hausTrpc.useUtils();
    return useMutation({
        mutationFn: async (folder: string) => {
            const token = getAppSessionAccessToken();
            if (!token) {
                throw new Error('Sign in to create a file.');
            }
            const listing = await utils.client.artifact.list.query({
                limit: artifactListPageMax,
                order: 'name',
                prefix: folder,
                serverId,
            });
            const name = untitledFileName(listing.artifacts.map((file) => file.filename));
            return await publishArtifactFile({
                file: new Blob(['# Untitled\n'], { type: 'text/markdown' }),
                onProgress: () => undefined,
                path: folder ? `${folder}/${name}` : name,
                replace: false,
                serverId,
                token,
            });
        },
        onError: (error) => toast.danger('Could not create a file', { description: error.message }),
        onSuccess: async (artifact) => {
            await utils.artifact.list.invalidate();
            onCreated(artifact);
        },
    });
}

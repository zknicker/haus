import { type ArtifactMetadata, artifactListPageMax } from '@haus/api';
import { toast } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { publishArtifactFile } from '../../hooks/artifacts/publish-artifact-file.ts';
import { getAppSessionAccessToken } from '../../lib/app-auth.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { newFolderCandidate, untitledFileName } from './drive-new-file.ts';

export function useNewDriveFile(serverId: string, onCreated: (artifact: ArtifactMetadata) => void) {
    const utils = hausTrpc.useUtils();
    const listFolder = (folder: string) =>
        utils.client.artifact.list.query({
            limit: artifactListPageMax,
            order: 'name',
            prefix: folder,
            serverId,
        });
    const onSuccess = async (artifact: ArtifactMetadata) => {
        await utils.artifact.list.invalidate();
        onCreated(artifact);
    };
    const file = useMutation({
        mutationFn: async (folder: string) => {
            const listing = await listFolder(folder);
            const name = untitledFileName(listing.artifacts.map((entry) => entry.filename));
            return await publishBlank(serverId, folder ? `${folder}/${name}` : name);
        },
        onError: (error) => toast.danger('Could not create a file', { description: error.message }),
        onSuccess,
    });
    const folder = useMutation({
        mutationFn: async (input: { name: string; parent: string }) => {
            const listing = await listFolder(input.parent);
            const taken = [
                ...listing.folders.map((entry) => entry.name),
                ...listing.artifacts.map((entry) => entry.filename),
            ];
            const candidate = newFolderCandidate(input.parent, input.name, taken);
            if (candidate.status !== 'ready') {
                throw new Error(
                    candidate.status === 'invalid' ? candidate.message : 'Name the folder.'
                );
            }
            return await publishBlank(serverId, `${candidate.path}/untitled.md`);
        },
        onSuccess,
    });
    return { file, folder };
}

async function publishBlank(serverId: string, path: string) {
    const token = getAppSessionAccessToken();
    if (!token) {
        throw new Error('Sign in to create files.');
    }
    return await publishArtifactFile({
        file: new Blob([''], { type: 'text/markdown' }),
        onProgress: () => undefined,
        path,
        replace: false,
        serverId,
        token,
    });
}

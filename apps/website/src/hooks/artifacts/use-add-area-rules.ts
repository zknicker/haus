import type { ArtifactMetadata } from '@haus/api';
import { useMutation } from '@tanstack/react-query';
import { getAppSessionAccessToken } from '../../lib/app-auth.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { publishArtifactFile } from './publish-artifact-file.ts';

export function useAddAreaRules(serverId: string, onAdded: (artifact: ArtifactMetadata) => void) {
    const utils = hausTrpc.useUtils();
    return useMutation({
        mutationFn: async (input: { folder: string; title: string }) => {
            const token = getAppSessionAccessToken();
            if (!token) {
                throw new Error('Sign in to add instructions.');
            }
            return await publishArtifactFile({
                file: new Blob([`# ${input.title}\n`], { type: 'text/markdown' }),
                onProgress: () => undefined,
                path: `${input.folder}/AGENTS.md`,
                replace: false,
                serverId,
                token,
            });
        },
        onSuccess: async (artifact) => {
            await utils.artifact.list.invalidate();
            onAdded(artifact);
        },
    });
}

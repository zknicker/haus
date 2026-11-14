import type { AvatarMediaType } from '@haus/api/avatar';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { withSavingToast } from '../../lib/saving-toast.ts';
import { refreshAgent } from './agent-refresh.ts';

export function useAgentAvatar(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.avatar.set.useMutation({
        onSuccess: () => refreshAgent(utils, serverId, agentId),
    });

    return {
        ...mutation,
        upload: async (image: { base64: string; mediaType: AvatarMediaType }) => {
            await withSavingToast(() =>
                mutation.mutateAsync({
                    bytesBase64: image.base64,
                    mediaType: image.mediaType,
                    serverId,
                    target: { agentId, kind: 'agent' },
                })
            );
        },
    };
}

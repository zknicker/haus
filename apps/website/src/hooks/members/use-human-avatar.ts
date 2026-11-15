import type { AvatarMediaType } from '@haus/api/avatar';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { withSavingToast } from '../../lib/saving-toast.ts';
import { refreshMember } from './member-refresh.ts';

export function useHumanAvatar(serverId: string, userId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.avatar.set.useMutation({
        onSuccess: () => refreshMember(utils, serverId, userId),
    });

    return {
        ...mutation,
        upload: async (image: { base64: string; mediaType: AvatarMediaType }) => {
            await withSavingToast(() =>
                mutation.mutateAsync({
                    bytesBase64: image.base64,
                    mediaType: image.mediaType,
                    serverId,
                    target: { kind: 'user' },
                })
            );
        },
    };
}

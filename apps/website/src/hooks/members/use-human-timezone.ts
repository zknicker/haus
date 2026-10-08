import { hausTrpc } from '../../lib/haus-server.tsx';
import { withSavingToast } from '../../lib/saving-toast.ts';
import { refreshMember } from './member-refresh.ts';

/** The signed-in human sets their own timezone; Agents read it from people lookup. */
export function useHumanTimezone(serverId: string, userId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.member.setTimezone.useMutation({
        onSuccess: () => refreshMember(utils, serverId, userId),
    });

    return {
        ...mutation,
        save: async (timezone: string) => {
            await withSavingToast(() => mutation.mutateAsync({ serverId, timezone }));
        },
    };
}

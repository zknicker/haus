import { useNavigate } from 'react-router-dom';
import { serversRoute } from '../../features/servers/server-routes.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * The membership mutations for one workspace. Each one owns the exact
 * invalidation its change implies, so no component decides what to refetch: a
 * role change and a departure both alter the directory and the viewer's own
 * standing, and a departure also changes which Chats they can open.
 */
export function useMembershipActions(serverId: string | undefined) {
    const utils = hausTrpc.useUtils();
    const navigate = useNavigate();

    const refreshMembership = async () => {
        await Promise.all([
            utils.member.list.invalidate(),
            utils.server.bySlug.invalidate(),
            utils.server.list.invalidate(),
        ]);
    };

    const refreshAfterDeparture = async () => {
        await Promise.all([refreshMembership(), utils.chat.list.invalidate()]);
    };

    return {
        changeRole: hausTrpc.member.changeRole.useMutation({ onSuccess: refreshMembership }),
        leave: hausTrpc.member.leave.useMutation({
            onSuccess: async () => {
                await refreshAfterDeparture();
                navigate(serversRoute);
            },
        }),
        remove: hausTrpc.member.remove.useMutation({ onSuccess: refreshAfterDeparture }),
        serverId,
    };
}

import { useNavigate } from 'react-router-dom';
import { serverRoute } from '../../features/servers/server-routes.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * What an invited human may see before accepting. Deliberately unpoliced: the
 * preview answers whether this token is still good right now, so opening the
 * page is exactly when it should be re-read. The app-wide staleness floor keeps
 * a remount within the window from re-asking.
 */
export function useInvitationPreview(token: string) {
    return hausTrpc.invitation.preview.useQuery({ token }, { enabled: token.length > 0 });
}

/** Accepting lands the human in the Server they were invited to. */
export function useAcceptInvitation() {
    const utils = hausTrpc.useUtils();
    const navigate = useNavigate();

    return hausTrpc.invitation.accept.useMutation({
        onSuccess: async (accepted) => {
            await utils.server.list.invalidate();
            navigate(serverRoute(accepted.serverSlug));
        },
    });
}

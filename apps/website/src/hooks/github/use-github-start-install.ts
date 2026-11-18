import { toast } from '@heroui/react';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * "Install on GitHub": opens GitHub's install page in a new tab with
 * Server-held state. GitHub's setup redirect lands that tab back on the
 * connection page with the outcome; this tab refreshes its installations the
 * first time the window regains focus after the install starts, since nothing
 * else tells it the install finished.
 */
export function useGithubStartInstall(serverId: string, connectionId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.github.startInstall.useMutation();
    const [awaitingReturn, setAwaitingReturn] = React.useState(false);

    React.useEffect(() => {
        if (!awaitingReturn) {
            return;
        }
        // Once per started install: candidates read GitHub, so refreshing on
        // every later focus would spend a GitHub call each time.
        const refresh = () => {
            setAwaitingReturn(false);
            void utils.github.installations.invalidate({ connectionId, serverId });
            void utils.github.installCandidates.invalidate({ connectionId, serverId });
        };
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, [awaitingReturn, connectionId, serverId, utils]);

    return {
        isPending: mutation.isPending,
        start: async () => {
            // Opened inside the press so a popup blocker allows it; the URL
            // arrives after the Server mints the state.
            const popup = window.open('about:blank', '_blank');
            if (popup) {
                popup.opener = null;
            }
            try {
                const { url } = await mutation.mutateAsync({ connectionId, serverId });
                if (popup) {
                    popup.location.href = url;
                } else {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
                setAwaitingReturn(true);
            } catch (error) {
                popup?.close();
                toast.danger('Could not start the install', {
                    description: error instanceof Error ? error.message : 'Try again shortly.',
                });
            }
        },
    };
}

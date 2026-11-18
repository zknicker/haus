import type { GithubTriggerConfigInput } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

/** Saves one Trigger and refreshes both its active row and history label. */
export function useTriggerUpdate(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.trigger.update.useMutation({
        onSuccess: async () =>
            await Promise.all([
                utils.trigger.history.invalidate({ agentId, serverId }),
                utils.trigger.list.invalidate({ agentId, serverId }),
            ]),
    });

    return {
        ...mutation,
        update: (
            triggerId: string,
            patch: {
                github?: GithubTriggerConfigInput;
                instruction?: string | null;
                title?: string;
            }
        ) => mutation.mutateAsync({ ...patch, serverId, triggerId }),
    };
}

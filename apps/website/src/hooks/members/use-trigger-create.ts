import type { TriggerSecretResult } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Triggers publish no durable event, so every mutation owns the list read's
 * refresh itself — there is no listener to defer to.
 */
export function useTriggerCreate(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.trigger.create.useMutation({
        onSuccess: () => utils.trigger.list.invalidate({ agentId, serverId }),
    });

    return {
        ...mutation,
        /** Creates a webhook, whose answer always carries its one readable secret. */
        create: async (input: {
            instruction?: string;
            kind: 'webhook';
            title: string;
        }): Promise<TriggerSecretResult> => {
            const result = await mutation.mutateAsync({ ...input, agentId, serverId });
            if (!('secret' in result)) {
                throw new Error('A webhook create answered without its secret.');
            }
            return result;
        },
    };
}

import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * A test fire rides the real fire path, so it changes both the Trigger's
 * counters and its history — this hook refreshes both, and reports the fire id
 * the operator can look up.
 */
export function useTriggerTestFire(serverId: string, agentId: string, triggerId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.trigger.test.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.trigger.list.invalidate({ agentId, serverId }),
                utils.trigger.history.invalidate({ agentId, serverId }),
                utils.trigger.runs.invalidate({ serverId, triggerId }),
            ]);
        },
    });

    return {
        ...mutation,
        testFire: async () => {
            try {
                const { fireId } = await mutation.mutateAsync({ serverId, triggerId });
                toast.success('Test fire sent', { description: `Fire ${fireId}` });
                return fireId;
            } catch (error) {
                toast.danger('Test fire failed', {
                    description:
                        error instanceof Error ? error.message : 'Try firing this trigger again.',
                });
                return null;
            }
        },
    };
}

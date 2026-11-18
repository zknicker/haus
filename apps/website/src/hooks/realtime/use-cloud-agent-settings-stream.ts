import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/** `cloudAgentSettings.onUpdated`: the Server's Cloud Agent settings changed. */
export function useCloudAgentSettingsStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('cloudAgentSettings.onUpdated', serverId, () => {
        if (serverId) {
            applyCloudAgentSettingsUpdate(coalescer, { serverId });
        }
    });

    const { reset } = hausTrpc.cloudAgentSettings.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyCloudAgentSettingsUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyCloudAgentSettingsUpdate(
    coalescer: TargetedReadCoalescer,
    { serverId }: { serverId: string }
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.cloudAgentSettings.get, { serverId }) });
}

import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `invitation.onUpdated` (Owners and Admins only, the same authority as
 * `invitation.list`; mount it only for them): an invitation was created,
 * revoked, or accepted.
 */
export function useInvitationUpdateStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('invitation.onUpdated', serverId, () => {
        if (serverId) {
            applyInvitationUpdate(coalescer, { serverId });
        }
    });

    const { reset } = hausTrpc.invitation.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyInvitationUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyInvitationUpdate(
    coalescer: TargetedReadCoalescer,
    { serverId }: { serverId: string }
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.invitation.list, { serverId }) });
}

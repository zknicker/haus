import type { ClaimChangedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/** `claim.onChanged`: the claim card on its message's entity, and the Server claim list. */
export function useClaimChangeStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('claim.onChanged', serverId, () => {
        if (serverId) {
            coalescer.recoverTranscriptLists({ serverId });
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.claim.list, { serverId }) });
        }
    });

    const { reset } = hausTrpc.claim.onChanged.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyClaimChange(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyClaimChange(coalescer: TargetedReadCoalescer, event: ClaimChangedEvent) {
    coalescer.noteMessageAnnotated(event);
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.claim.list, { serverId: event.serverId }),
    });
}

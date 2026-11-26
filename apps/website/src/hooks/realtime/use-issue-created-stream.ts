import { hausTrpc } from '../../lib/haus-server.tsx';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { invalidateIssueLists } from './issue-reads.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

export function useIssueCreatedStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('issue.onCreated', serverId, () => {
        if (serverId) {
            invalidateIssueLists(coalescer, serverId);
        }
    });
    const { reset } = hausTrpc.issue.onCreated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => invalidateIssueLists(coalescer, event.serverId),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

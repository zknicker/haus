import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { invalidateIssueDetails, refreshIssueReads } from './issue-reads.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

export function useIssueSubscriptionStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const stream = useSubscriptionRestart('issue.onSubscriptionUpdated', serverId, () => {
        if (serverId) {
            invalidateIssueDetails(coalescer, serverId);
        }
    });
    const { reset } = hausTrpc.issue.onSubscriptionUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => refreshIssueReads(coalescer, queryClient, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

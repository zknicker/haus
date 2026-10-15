import type { LinearIssueChangedEvent, LinearIssueResult } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from '../realtime/use-subscription-restart.ts';
import { type LinearIssueReadInput, linearIssueReadMatches } from './linear-issue-change.ts';

/**
 * `linear.onIssueChanged`: a delivery changed one issue. Only the chip reads
 * showing that issue refetch; a restart refetches every chip read on the
 * Server, since any of them may have missed a change.
 */
export function useLinearIssueStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const stream = useSubscriptionRestart('linear.onIssueChanged', serverId, () => {
        if (serverId) {
            coalescer.invalidate({
                queryKey: getQueryKey(hausTrpc.linear.issue, { serverId }),
            });
        }
    });

    const { reset } = hausTrpc.linear.onIssueChanged.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyLinearIssueChange(queryClient, coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyLinearIssueChange(
    queryClient: QueryClient,
    coalescer: TargetedReadCoalescer,
    event: LinearIssueChangedEvent
) {
    const reads = queryClient
        .getQueryCache()
        .findAll({ queryKey: getQueryKey(hausTrpc.linear.issue, { serverId: event.serverId }) });
    for (const query of reads) {
        const input = readInput(query.queryKey);
        if (
            input &&
            linearIssueReadMatches(input, query.state.data as LinearIssueResult | undefined, event)
        ) {
            coalescer.invalidate({ exact: true, queryKey: query.queryKey });
        }
    }
}

/** tRPC keys are `[path, { input, type }]`. */
function readInput(queryKey: readonly unknown[]): LinearIssueReadInput | null {
    const meta = queryKey[1];
    if (!(meta && typeof meta === 'object' && 'input' in meta)) {
        return null;
    }
    const input = meta.input;
    return input &&
        typeof input === 'object' &&
        'serverId' in input &&
        'url' in input &&
        typeof input.serverId === 'string' &&
        typeof input.url === 'string'
        ? { serverId: input.serverId, url: input.url }
        : null;
}

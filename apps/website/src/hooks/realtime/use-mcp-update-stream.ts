import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/** `mcp.onUpdated`: the Server's MCP connections and the Amazon reads behind them. */
export function useMcpUpdateStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('mcp.onUpdated', serverId, () => {
        if (serverId) {
            applyMcpUpdate(coalescer, { serverId });
        }
    });

    const { reset } = hausTrpc.mcp.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyMcpUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyMcpUpdate(
    coalescer: TargetedReadCoalescer,
    { serverId }: { serverId: string }
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.mcp.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.mcp.amazonProduct, { serverId }) });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.mcp.amazonProductDetail, { serverId }),
    });
}

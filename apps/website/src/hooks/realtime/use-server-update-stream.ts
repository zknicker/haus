import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import type { RealtimeServer } from './realtime-server.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `server.onUpdated`, mounted for every accessible Server: a rename moves the
 * Server detail and the Server list. It is also the membership sentinel:
 * deleting the Server or removing the viewer ends this stream with
 * `membership_lost`, whose restart policy runs the Server-loss path and closes
 * every sibling stream of the Server.
 */
export function useServerUpdateStream(server: RealtimeServer) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('server.onUpdated', server.id, () =>
        applyServerUpdate(coalescer, server)
    );

    const { reset } = hausTrpc.server.onUpdated.useSubscription(
        { serverId: server.id },
        {
            enabled: stream.open,
            onComplete: () => stream.completed(reset),
            onData: () => applyServerUpdate(coalescer, server),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyServerUpdate(coalescer: TargetedReadCoalescer, server: RealtimeServer) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.server.bySlug, { slug: server.slug }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.server.list) });
}

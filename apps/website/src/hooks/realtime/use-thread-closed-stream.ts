import { hausTrpc } from '../../lib/haus-server.tsx';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { invalidateOpenThreads } from './open-thread-reads.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/** `thread.onClosedUpdated`: the viewer closed or reopened a Thread on some device. */
export function useThreadClosedStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('thread.onClosedUpdated', serverId, () => {
        if (serverId) {
            invalidateOpenThreads(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.thread.onClosedUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => invalidateOpenThreads(coalescer, event.serverId),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

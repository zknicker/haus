import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from '../realtime/use-subscription-restart.ts';

export function useDesktopActivity(serverId: string, computerId: string) {
    const coalescer = useTargetedReadCoalescer();
    const input = { computerId, serverId };
    const invalidate = () =>
        coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.computer.desktopActivity, input) });
    const stream = useSubscriptionRestart('computer.onDesktopActivity', serverId, invalidate);
    const { reset } = hausTrpc.computer.onDesktopActivity.useSubscription(
        { serverId },
        {
            enabled: stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => {
                if (event.computerId === computerId) {
                    invalidate();
                }
            },
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
    return hausTrpc.computer.desktopActivity.useQuery(input, queryPolicy.syncedSnapshot);
}

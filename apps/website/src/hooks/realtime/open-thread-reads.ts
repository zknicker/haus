import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { TargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';

/** Open Threads derive from Messages, reads, follows, work, and Close, so each stream refreshes them. */
export function invalidateOpenThreads(
    coalescer: Pick<TargetedReadCoalescer, 'invalidate'>,
    serverId: string
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.thread.listOpen, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.thread.listEarlier, { serverId }) });
}

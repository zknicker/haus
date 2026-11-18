import type { MemberUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import type { RealtimeServer } from './realtime-server.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `member.onUpdated`, mounted for every accessible Server: a human joined,
 * left, changed role, or edited their profile. It moves that human's record,
 * the directory, `chat.list` (rows name human authors and participants), and
 * the Server detail (the viewer's own role gates role-only streams).
 */
export function useMemberUpdateStream(server: RealtimeServer) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('member.onUpdated', server.id, () =>
        applyMemberUpdate(coalescer, server, null)
    );

    const { reset } = hausTrpc.member.onUpdated.useSubscription(
        { serverId: server.id },
        {
            enabled: stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyMemberUpdate(coalescer, server, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

/** A null event (recovery) refreshes every directory record of the Server. */
export function applyMemberUpdate(
    coalescer: TargetedReadCoalescer,
    server: RealtimeServer,
    event: MemberUpdatedEvent | null
) {
    const serverId = server.id;
    coalescer.invalidate({
        queryKey: getQueryKey(
            hausTrpc.member.get,
            event ? { serverId, userId: event.memberId } : { serverId }
        ),
    });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.member.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.server.bySlug, { slug: server.slug }) });
}

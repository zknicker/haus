import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** Routing is immutable once the message and its inbox recipients commit. */
export function useMessageRouting(serverId: string, messageId: string) {
    return hausTrpc.chat.messageRouting.useQuery(
        { serverId, messageId },
        { ...queryPolicy.syncedSnapshot, staleTime: Number.POSITIVE_INFINITY }
    );
}

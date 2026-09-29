import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * The viewer's Needs you rows on one Server (ADR 0037): DMs, @mentions, and
 * inline replies to their messages addressed to them that they have not answered or marked Done, newest first.
 * `message.created` and `chat.read` invalidate it (`chat-events/`), so it
 * follows replies, new addressing, and Done from any client.
 */
export function useNeedsYou(serverId: string | undefined) {
    return hausTrpc.inbox.needsYou.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined }
    );
}

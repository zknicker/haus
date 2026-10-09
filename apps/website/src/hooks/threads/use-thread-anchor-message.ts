import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** Fetch a linked Thread's anchor when it is outside the loaded transcript. */
export function useThreadAnchorMessage(
    serverId: string,
    chatId: string,
    anchorMessageId: string | null
) {
    // Named fields only: a spread would re-render the reader on every fetch-status flip.
    const { data, error } = hausTrpc.chat.messages.useQuery(
        { aroundMessageId: anchorMessageId ?? '', chatId, limit: 1, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: anchorMessageId !== null }
    );
    return {
        anchor: data?.messages.find((message) => message.id === anchorMessageId),
        data,
        error,
    };
}

import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type ChatMessageEntry,
    chatMessageQueryOptions,
    ensureChatMessageDefaults,
} from './chat-message-entities.ts';

/**
 * Whether entity reads below observe their entries: the view's shown state.
 * A hidden kept chat view (`KeptChatViews`) provides false, so it holds no
 * active `chat.message` observers; an invalidation only marks its entries
 * stale, and its rows fetch what changed when the view is revealed.
 */
export const ChatMessageSubscriptionContext = React.createContext(true);

/**
 * One message entity, `{ message, thread }`, or null once the id no longer
 * resolves in its Chat; undefined while it has never loaded. List reads seed
 * it, so a row normally renders from the cache with no request; it fetches
 * only when invalidated while observed or missing (never seeded, or
 * collected while its list stayed cached). Freshness comes from the family
 * defaults (`ensureChatMessageDefaults`), never from this hook.
 */
export function useChatMessage(
    serverId: string,
    chatId: string,
    messageId: string,
    { enabled = true }: { enabled?: boolean } = {}
): ChatMessageEntry | undefined {
    const queryClient = useQueryClient();
    const { client } = hausTrpc.useUtils();
    const subscribed = React.use(ChatMessageSubscriptionContext);
    ensureChatMessageDefaults(queryClient);
    const { data } = useQuery({
        ...chatMessageQueryOptions(client, { chatId, messageId, serverId }),
        enabled,
        subscribed,
    });
    return data;
}

/** Several entities at once, in input order: the rows of one transcript entry. */
export function useChatMessageEntries(
    targets: readonly { chatId: string; messageId: string; serverId: string }[]
): readonly (ChatMessageEntry | undefined)[] {
    const queryClient = useQueryClient();
    const { client } = hausTrpc.useUtils();
    const subscribed = React.use(ChatMessageSubscriptionContext);
    ensureChatMessageDefaults(queryClient);
    return useQueries({
        combine: (results) => results.map((result) => result.data),
        queries: targets.map((target) => chatMessageQueryOptions(client, target)),
        subscribed,
    });
}

import type { ChatMessageEntity, ChatMessageInput } from '@haus/api';
import { notifyManager, type Query, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import type { ChatMessagePage } from './chat-message-layout.ts';

export type { ChatMessageEntity } from '@haus/api';

/** A `chat.message` entry: the entity, null once the id no longer resolves in its Chat. */
export type ChatMessageEntry = ChatMessageEntity | null;

/**
 * The `chat.message` key family. Its policy is registered on the client
 * (`ensureChatMessageDefaults`), not on a hook: `setQueryData` builds a query
 * from the client's defaults, so a seeded-only entry would otherwise miss it.
 */
export const chatMessageFamilyKey: QueryKey = getQueryKey(hausTrpc.chat.message);

/**
 * Entities stay fresh by targeted invalidation and list reseeding only: never
 * on focus, reconnect, or a stale clock (specs/realtime-events.md, "Entity
 * query policy"). The 30 min `gcTime` lets an unvisited Chat's rows go; an
 * observing row whose entity was collected fetches it again.
 */
export const chatMessageEntityDefaults = {
    gcTime: 30 * 60 * 1000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
} as const;

const registered = new WeakSet<QueryClient>();

/** Registers the family policy on this client once; idempotent. */
export function ensureChatMessageDefaults(queryClient: QueryClient) {
    if (registered.has(queryClient)) {
        return;
    }
    registered.add(queryClient);
    queryClient.setQueryDefaults(chatMessageFamilyKey, chatMessageEntityDefaults);
}

export function chatMessageQueryKey(serverId: string, chatId: string, messageId: string) {
    return getQueryKey(hausTrpc.chat.message, { chatId, messageId, serverId }, 'query');
}

export function chatMessageQueryOptions(
    client: ReturnType<typeof hausTrpc.createClient>,
    input: ChatMessageInput
) {
    return {
        queryFn: ({ signal }: { signal: AbortSignal }) =>
            client.chat.message.query(input, { signal }) as Promise<ChatMessageEntry>,
        queryKey: chatMessageQueryKey(input.serverId, input.chatId, input.messageId),
    };
}

/**
 * Seeds one canonical `chat.messages` read's entities in a single batch: one
 * entry per message with its Thread summary or null. Only canonical
 * projections seed; a `chat.search` row never does (it carries no task or
 * Thread summary). Structural sharing keeps an unchanged entity's object, so
 * its row does not re-render.
 */
export function seedChatMessageEntities(queryClient: QueryClient, page: ChatMessagePage) {
    ensureChatMessageDefaults(queryClient);
    const threads = new Map(page.threads.map((thread) => [thread.anchorMessageId, thread]));
    notifyManager.batch(() => {
        for (const message of page.messages) {
            queryClient.setQueryData<ChatMessageEntry>(
                chatMessageQueryKey(message.serverId, message.chatId, message.id),
                { message, thread: threads.get(message.id) ?? null }
            );
        }
    });
}

/** The cached entity, without observing it: for event-time lookups (a click, a handler). */
export function readChatMessageEntity(
    queryClient: QueryClient,
    serverId: string,
    chatId: string,
    messageId: string
): ChatMessageEntry | undefined {
    return queryClient.getQueryData<ChatMessageEntry>(
        chatMessageQueryKey(serverId, chatId, messageId)
    );
}

/** The `{ serverId, chatId, messageId }` of a `chat.message` query, or null for any other query. */
export function chatMessageQueryInput(query: Pick<Query, 'queryKey'>): ChatMessageInput | null {
    const [path, options] = query.queryKey as [unknown, { input?: unknown } | undefined];
    if (
        !(Array.isArray(path) && path[0] === 'chat' && path[1] === 'message' && path.length === 2)
    ) {
        return null;
    }
    const input = options?.input as Partial<ChatMessageInput> | undefined;
    return typeof input?.serverId === 'string' &&
        typeof input.chatId === 'string' &&
        typeof input.messageId === 'string'
        ? { chatId: input.chatId, messageId: input.messageId, serverId: input.serverId }
        : null;
}

/** Whether this query is a `chat.message` entity of the Server (and Chat, when given). */
export function isChatMessageEntityOf(
    query: Pick<Query, 'queryKey'>,
    scope: { chatId?: string; serverId: string }
) {
    const input = chatMessageQueryInput(query);
    return (
        input !== null &&
        input.serverId === scope.serverId &&
        (scope.chatId === undefined || input.chatId === scope.chatId)
    );
}

/**
 * Derived dependency: task labels are embedded rows, so a renamed, recolored,
 * or deleted label invalidates every cached entity of the Server that carries it.
 */
export function entityCarriesTaskLabel(
    query: Pick<Query, 'queryKey' | 'state'>,
    serverId: string,
    labelId: string
) {
    if (!isChatMessageEntityOf(query, { serverId })) {
        return false;
    }
    const entry = query.state.data as ChatMessageEntry | undefined;
    return Boolean(entry?.message.task?.labels.some((label) => label.id === labelId));
}

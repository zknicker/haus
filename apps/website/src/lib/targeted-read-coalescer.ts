import type { MessageCreatedEvent } from '@haus/api';
import { type Query, type QueryClient, type QueryKey, useQueryClient } from '@tanstack/react-query';
import {
    chatMessageQueryKey,
    entityCarriesTaskLabel,
    isChatMessageEntityOf,
} from '../hooks/servers/chat-message-entities.ts';
import { hausTrpc } from './haus-server.tsx';
import { createStartReconciliation } from './start-reconciliation.ts';
import {
    type ChatScope,
    type HausClient,
    TranscriptListReads,
    transcriptListInput,
} from './transcript-list-reads.ts';

export type { ChatScope } from './transcript-list-reads.ts';

/** One message whose annotations (reactions, Thread summary, task, Cloud Agent work) changed. */
export interface MessageTarget extends ChatScope {
    messageId: string;
}

/**
 * The App's transcript cache operations (specs/realtime-events.md,
 * "Concurrency"). Realtime hooks answer every event through these; nothing
 * else patches transcript lists or `chat.message` entities. Every
 * invalidation uses `refetchType: 'active'` and is coalesced per key within
 * one animation frame across all callers.
 */
export interface TargetedReadCoalescer {
    /** Applies every invalidation queued for the next frame or a start's settle window now. */
    flushInvalidations(): void;
    /**
     * A coalesced `refetchType: 'active'` invalidation of one key (exact) or a
     * key prefix. Inside `reconcileStart` it refreshes only reads fetched
     * before that start.
     */
    invalidate(filters: { exact?: boolean; queryKey: QueryKey }): void;
    /** The list-read owner `chatMessagesQueryOptions` reads pages through. */
    readonly lists: TranscriptListReads;
    /**
     * Reaction, Thread summary (reply, read, follow), task, or Cloud Agent
     * work changed one message: mark it dirty, cancel its in-flight fetch,
     * then invalidate its entity.
     */
    noteMessageAnnotated(target: MessageTarget): void;
    /**
     * `chat.onMessageCreated`: tail-read every cached list of the Chat; a
     * Thread reply also refreshes its parent anchor's entity (the summary).
     * Invalidating `chat.list` and `chat.search` stays with the caller.
     */
    noteMessageCreated(
        event: Pick<
            MessageCreatedEvent,
            'chatId' | 'parentChatId' | 'sequence' | 'serverId' | 'threadAnchorMessageId'
        >
    ): void;
    /**
     * A label has no message ids: abort the Server's tail reads, cancel and
     * refetch its lists, then its carriers.
     */
    noteTaskLabelUpdated(event: { labelId: string; serverId: string }): Promise<void>;
    /** Runs `listener(scope)` after each Chat purge (kept views and pending rows drop theirs). */
    onChatPurged(listener: (scope: ChatScope) => void): () => void;
    /** `chat.onLifecycle` `deleted`: abort tails, cancel and remove the Chat's lists and entities. */
    purgeChat(scope: ChatScope): Promise<void>;
    /** Membership loss: abort tails, cancel and remove the Server's lists and entities. */
    purgeServer(scope: { serverId: string }): Promise<void>;
    /**
     * A focused subscription started (first start, resubscribe after a socket
     * reconnect, or restart after a failure): run `recover`, the stream's
     * owned-read recovery, refreshing only reads that began before this start
     * (`start-reconciliation.ts`).
     */
    reconcileStart(recover: () => void): void;
    /** Stream start: refetch the loaded pages of the Server's (or these Chats') lists. */
    recoverTranscriptLists(scope: { chatIds?: readonly string[]; serverId: string }): void;
    /** A send receipt or other ack: the same tail read, without the anchor refresh. */
    requestTail(scope: ChatScope & { sequence: number }): void;
}

export interface TargetedReadCoalescerOptions {
    client: HausClient;
    queryClient: QueryClient;
    /** Defaults to the next animation frame (a microtask outside a browser). */
    scheduleFrame?: (flush: () => void) => void;
}

const coalescers = new WeakMap<QueryClient, TargetedReadCoalescer>();
const clients = new WeakMap<QueryClient, HausClient>();
const purgeListeners = new WeakMap<QueryClient, Set<(scope: ChatScope) => void>>();

/** The one coalescer for this QueryClient; `client` is the tRPC client its reads use. */
export function targetedReadCoalescer(queryClient: QueryClient, client: HausClient) {
    clients.set(queryClient, client);
    let coalescer = coalescers.get(queryClient);
    if (!coalescer) {
        coalescer = createTargetedReadCoalescer({ client, queryClient });
        coalescers.set(queryClient, coalescer);
    }
    return coalescer;
}

/** The mounted App's coalescer. */
export function useTargetedReadCoalescer() {
    const queryClient = useQueryClient();
    const { client } = hausTrpc.useUtils();
    return targetedReadCoalescer(queryClient, client);
}

export function createTargetedReadCoalescer({
    client,
    queryClient,
    scheduleFrame = scheduleNextFrame,
}: TargetedReadCoalescerOptions): TargetedReadCoalescer {
    const lists = new TranscriptListReads(queryClient, () => clients.get(queryClient) ?? client);
    const starts = createStartReconciliation(queryClient);
    const queued = new Map<string, { exact: boolean; queryKey: QueryKey }>();
    let scheduled = false;

    const flushInvalidations = () => {
        scheduled = false;
        const batch = [...queued.values()];
        queued.clear();
        for (const { exact, queryKey } of batch) {
            void queryClient.invalidateQueries({ exact, queryKey, refetchType: 'active' });
        }
        starts.flush();
    };
    const invalidate = ({ exact = false, queryKey }: { exact?: boolean; queryKey: QueryKey }) => {
        if (starts.queue({ exact, queryKey })) {
            return;
        }
        queued.set(`${exact ? '=' : '^'}${JSON.stringify(queryKey)}`, { exact, queryKey });
        if (!scheduled) {
            scheduled = true;
            scheduleFrame(flushInvalidations);
        }
    };
    const invalidateEach = (queries: readonly Query[]) => {
        for (const query of queries) {
            invalidate({ exact: true, queryKey: query.queryKey });
        }
    };
    const noteMessageAnnotated = (target: MessageTarget) => {
        lists.noteDirty(target, target.messageId);
        const queryKey = chatMessageQueryKey(target.serverId, target.chatId, target.messageId);
        // Cancel first: a plain invalidation would reuse an older in-flight fetch.
        void queryClient
            .cancelQueries({ exact: true, queryKey })
            .then(() => invalidate({ exact: true, queryKey }));
    };
    const purge = async (scope: { chatId?: string; serverId: string }) => {
        lists.abort(scope);
        const purgedLists = new Set(lists.lists(scope));
        const filters = {
            predicate: (query: Query) =>
                purgedLists.has(query) || isChatMessageEntityOf(query, scope),
        };
        await queryClient.cancelQueries(filters);
        queryClient.removeQueries(filters);
    };

    return {
        flushInvalidations,
        invalidate,
        lists,
        noteMessageAnnotated,
        noteMessageCreated: (event) => {
            lists.requestTail(event, event.sequence);
            if (event.parentChatId && event.threadAnchorMessageId) {
                noteMessageAnnotated({
                    chatId: event.parentChatId,
                    messageId: event.threadAnchorMessageId,
                    serverId: event.serverId,
                });
            }
        },
        noteTaskLabelUpdated: async ({ labelId, serverId }) => {
            const serverLists = lists.lists({ serverId });
            // No list or tail read in flight may land and seed the old label:
            // abort the Server's tails (React Query cannot cancel them), then
            // cancel its list fetches. The bulk refetch below re-reads any tail.
            lists.abort({ serverId });
            await queryClient.cancelQueries({ predicate: (query) => serverLists.includes(query) });
            invalidateEach(serverLists);
            const fetching = (query: Query) =>
                isChatMessageEntityOf(query, { serverId }) &&
                query.state.fetchStatus === 'fetching';
            await queryClient.cancelQueries({ predicate: fetching });
            invalidateEach(
                queryClient.getQueryCache().findAll({
                    predicate: (query) =>
                        fetching(query) || entityCarriesTaskLabel(query, serverId, labelId),
                })
            );
        },
        onChatPurged: (listener) => subscribeChatPurges(queryClient, listener),
        purgeChat: async (scope) => {
            await purge(scope);
            for (const listener of purgeListeners.get(queryClient) ?? []) {
                listener(scope);
            }
        },
        purgeServer: (scope) => purge(scope),
        reconcileStart: (recover) => starts.run(recover),
        recoverTranscriptLists: ({ chatIds, serverId }) => {
            invalidateEach(
                lists
                    .lists({ serverId })
                    .filter(
                        (query) =>
                            chatIds === undefined ||
                            chatIds.includes(transcriptListInput(query)?.chatId ?? '')
                    )
            );
        },
        requestTail: ({ sequence, ...scope }) => lists.requestTail(scope, sequence),
    };
}

/**
 * Runs `listener` after each Chat purge on this client, whether or not its
 * coalescer exists yet: retained views subscribe without a tRPC client.
 */
export function subscribeChatPurges(
    queryClient: QueryClient,
    listener: (scope: ChatScope) => void
): () => void {
    let listeners = purgeListeners.get(queryClient);
    if (!listeners) {
        listeners = new Set();
        purgeListeners.set(queryClient, listeners);
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** One flush per frame; outside a browser (tests, workers), after the current task. */
function scheduleNextFrame(flush: () => void) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => flush());
    } else {
        queueMicrotask(flush);
    }
}

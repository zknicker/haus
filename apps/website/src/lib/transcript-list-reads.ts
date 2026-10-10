import type { InfiniteData, Query, QueryClient, QueryKey } from '@tanstack/react-query';
import {
    chatMessageQueryKey,
    seedChatMessageEntities,
} from '../hooks/servers/chat-message-entities.ts';
import {
    appendToNewestPage,
    type ChatMessagePage,
    type TranscriptPage,
    toTranscriptPage,
} from '../hooks/servers/chat-message-layout.ts';
import type { hausTrpc } from './haus-server.tsx';
import { isTranscriptListOf, transcriptListInput } from './transcript-list-key.ts';

export type HausClient = ReturnType<typeof hausTrpc.createClient>;

export interface ChatScope {
    chatId: string;
    serverId: string;
}

interface ChatReadState {
    controller: AbortController;
    /** Annotated message ids a list read in flight may have seeded an older copy of. */
    dirty: Set<string>;
    inFlight: number;
}

/**
 * Transcript list reads for one QueryClient: every list and tail read seeds
 * its entities, the per-Chat dirty sets and in-flight counts, and the
 * `tailNeeded` bits drained one tail read at a time per list
 * (specs/realtime-events.md, "Normalized transcript cache"). Owned by
 * `targeted-read-coalescer.ts`; nothing else constructs it.
 */
export class TranscriptListReads {
    readonly #chats = new Map<string, ChatReadState>();
    readonly #draining = new Set<string>();
    readonly #queryClient: QueryClient;
    readonly #readClient: () => HausClient;
    readonly #tailNeeded = new Map<string, number>();

    constructor(queryClient: QueryClient, readClient: () => HausClient) {
        this.#queryClient = queryClient;
        this.#readClient = readClient;
    }

    /**
     * One list read (a React Query page fetch or a tail read). Counts as in
     * flight for its Chat, seeds its entities unless cancelled, then
     * re-invalidates the Chat's dirty ids: an annotation event that arrived
     * mid-read may have been overwritten by this read's older copy.
     */
    async readList(
        scope: ChatScope,
        signal: AbortSignal,
        read: () => Promise<ChatMessagePage>
    ): Promise<TranscriptPage> {
        const state = this.#chat(scope);
        state.inFlight += 1;
        try {
            const page = await read();
            if (signal.aborted || state.controller.signal.aborted) {
                throw new DOMException('The transcript read was cancelled.', 'AbortError');
            }
            seedChatMessageEntities(this.#queryClient, page);
            for (const messageId of state.dirty) {
                void this.#queryClient.invalidateQueries(
                    {
                        exact: true,
                        queryKey: chatMessageQueryKey(scope.serverId, scope.chatId, messageId),
                        refetchType: 'active',
                    },
                    { cancelRefetch: false }
                );
            }
            return toTranscriptPage(page);
        } finally {
            state.inFlight -= 1;
            if (state.inFlight === 0) {
                state.dirty.clear();
            }
        }
    }

    /** Marks an annotated id dirty while any list read of its Chat is in flight. */
    noteDirty(scope: ChatScope, messageId: string) {
        const state = this.#chats.get(chatKey(scope));
        if (state && state.inFlight > 0) {
            state.dirty.add(messageId);
        }
    }

    /** Sets `tailNeeded` on every list of the Chat that is loaded or loading, then drains it. */
    requestTail(scope: ChatScope, sequence: number) {
        for (const query of this.lists(scope)) {
            if (query.state.data === undefined && query.state.fetchStatus !== 'fetching') {
                continue;
            }
            const needed = this.#tailNeeded.get(query.queryHash) ?? 0;
            this.#tailNeeded.set(query.queryHash, Math.max(needed, sequence));
            void this.#drain(query.queryKey, query.queryHash, scope);
        }
    }

    /** Aborts tail reads and in-flight seeding for a Chat, or for every Chat of a Server. */
    abort(scope: { chatId?: string; serverId: string }) {
        for (const [key, state] of this.#chats) {
            const [serverId, chatId] = key.split('\u0000');
            if (
                serverId === scope.serverId &&
                (scope.chatId === undefined || chatId === scope.chatId)
            ) {
                state.controller.abort();
                this.#chats.delete(key);
            }
        }
        for (const query of this.lists(scope)) {
            this.#tailNeeded.delete(query.queryHash);
        }
    }

    /** Every cached transcript list of the Server, narrowed to a Chat when given. */
    lists(scope: { chatId?: string; serverId: string }): Query[] {
        return this.#queryClient
            .getQueryCache()
            .findAll({ predicate: (query) => isTranscriptListOf(query, scope) });
    }

    async #drain(queryKey: QueryKey, hash: string, scope: ChatScope) {
        if (this.#draining.has(hash)) {
            return;
        }
        this.#draining.add(hash);
        const { signal } = this.#chat(scope).controller;
        try {
            while (this.#tailNeeded.has(hash) && !signal.aborted) {
                await this.#untilIdle(hash, signal);
                const sequence = this.#tailNeeded.get(hash);
                this.#tailNeeded.delete(hash);
                if (sequence === undefined || signal.aborted) {
                    break;
                }
                if (await this.#tail(queryKey, hash, sequence, scope, signal)) {
                    // A list fetch ran across the append and may land over it: tail again after.
                    const needed = this.#tailNeeded.get(hash) ?? 0;
                    this.#tailNeeded.set(hash, Math.max(needed, sequence));
                }
            }
        } catch (error) {
            if (!isAbort(error)) {
                // A failed tail read leaves the list behind: mark it stale so its next observe reads it.
                void this.#queryClient.invalidateQueries({
                    exact: true,
                    queryKey,
                    refetchType: 'none',
                });
            }
        } finally {
            this.#draining.delete(hash);
            // A tail requested while an aborted drain still held the list.
            if (this.#tailNeeded.has(hash)) {
                void this.#drain(queryKey, hash, scope);
            }
        }
    }

    /** Returns whether a React Query fetch of the list was in flight when the tail appended. */
    async #tail(
        queryKey: QueryKey,
        hash: string,
        sequence: number,
        scope: ChatScope,
        signal: AbortSignal
    ) {
        const query = this.#queryClient.getQueryCache().get(hash);
        const input = query ? transcriptListInput(query) : null;
        const newest = (query?.state.data as InfiniteData<TranscriptPage> | undefined)?.pages[0];
        if (!(query && input && newest)) {
            return false;
        }
        if (newest.nextAfterSequence !== null) {
            // Scrolled into history: an active list refetches on return; an inactive one goes stale.
            if (!query.isActive()) {
                void this.#queryClient.invalidateQueries({
                    exact: true,
                    queryKey,
                    refetchType: 'none',
                });
            }
            return false;
        }
        let afterSequence = newest.scannedThroughSequence;
        let raced = false;
        while (afterSequence < sequence) {
            const page = await this.readList(scope, signal, () =>
                this.#readClient().chat.messages.query({ ...input, afterSequence }, { signal })
            );
            const current = this.#queryClient.getQueryCache().get(hash);
            if (signal.aborted || current?.state.data === undefined) {
                return false;
            }
            this.#queryClient.setQueryData<InfiniteData<TranscriptPage>>(queryKey, (data) =>
                data ? { ...data, pages: appendToNewestPage(data.pages, page) } : data
            );
            raced ||= current.state.fetchStatus === 'fetching';
            if (page.nextAfterSequence === null) {
                break;
            }
            afterSequence = page.scannedThroughSequence;
        }
        return raced;
    }

    #untilIdle(hash: string, signal: AbortSignal) {
        const cache = this.#queryClient.getQueryCache();
        const settled = () => {
            const query = cache.get(hash);
            return signal.aborted || !query || query.state.fetchStatus !== 'fetching';
        };
        if (settled()) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            // The Chat's signal lives as long as the Chat, so each wait removes its own listener.
            const done = () => {
                unsubscribe();
                signal.removeEventListener('abort', done);
                resolve();
            };
            const unsubscribe = cache.subscribe(() => {
                if (settled()) {
                    done();
                }
            });
            signal.addEventListener('abort', done, { once: true });
        });
    }

    #chat(scope: ChatScope): ChatReadState {
        const key = chatKey(scope);
        let state = this.#chats.get(key);
        if (!state) {
            state = { controller: new AbortController(), dirty: new Set(), inFlight: 0 };
            this.#chats.set(key, state);
        }
        return state;
    }
}

function chatKey(scope: ChatScope) {
    return `${scope.serverId}\u0000${scope.chatId}`;
}

function isAbort(error: unknown) {
    return error instanceof Error && error.name === 'AbortError';
}

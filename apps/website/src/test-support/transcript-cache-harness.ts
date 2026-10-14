import type { ChatMessage, ThreadSummary } from '@haus/api';
import {
    type InfiniteData,
    InfiniteQueryObserver,
    QueryClient,
    QueryObserver,
} from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import {
    type ChatMessageEntry,
    chatMessageQueryKey,
    chatMessageQueryOptions,
    ensureChatMessageDefaults,
} from '../hooks/servers/chat-message-entities.ts';
import type { ChatMessagePage, TranscriptPage } from '../hooks/servers/chat-message-layout.ts';
import { chatMessagesQueryOptions } from '../hooks/servers/use-chat-messages.ts';
import { hausTrpc } from '../lib/haus-server.tsx';
import { queryClientDefaultOptions } from '../lib/query-policy.ts';
import { targetedReadCoalescer } from '../lib/targeted-read-coalescer.ts';

export const serverId = 'srv_cache';

export interface ReadRequest {
    input: Record<string, unknown>;
    path: string;
}

/** What the fake Server answers a read with; return a held promise to hold it. */
export type ReadHandler = (request: ReadRequest) => Promise<unknown>;

/**
 * A real QueryClient and coalescer over a fake tRPC transport. Every read is
 * logged and answered by `handle`, so a test can hold a response, deliver an
 * event while it is in flight, and release it.
 */
export function createTranscriptCache(handle: ReadHandler) {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    ensureChatMessageDefaults(queryClient);
    const requests: ReadRequest[] = [];
    const client = hausTrpc.createClient({
        links: [
            () =>
                ({ op }) =>
                    observable((observer) => {
                        const request = {
                            input: op.input as Record<string, unknown>,
                            path: op.path,
                        };
                        requests.push(request);
                        handle(request).then(
                            (data) => {
                                observer.next({ result: { data } });
                                observer.complete();
                            },
                            (cause: unknown) => observer.error(TRPCClientError.from(cause as Error))
                        );
                    }),
        ],
    });
    const coalescer = targetedReadCoalescer(queryClient, client);

    return {
        client,
        coalescer,
        queryClient,
        requests,
        /** Requests to one procedure, e.g. `chat.messages`. */
        reads: (path: string) => requests.filter((request) => request.path === path),
        /** Mounts an observer on a transcript list, as a shown transcript does. */
        observeList(chatId: string, replyRootMessageId?: string) {
            const observer = new InfiniteQueryObserver(
                queryClient,
                chatMessagesQueryOptions(
                    { client, queryClient },
                    serverId,
                    chatId,
                    replyRootMessageId ? { replyRootMessageId } : undefined
                )
            );
            const close = observer.subscribe(() => undefined);
            return { close, observer };
        },
        /** Mounts an observer on one entity, as a shown row does. */
        observeEntity(chatId: string, messageId: string) {
            const observer = new QueryObserver<ChatMessageEntry>(
                queryClient,
                chatMessageQueryOptions(client, { chatId, messageId, serverId })
            );
            const close = observer.subscribe(() => undefined);
            return { close, observer };
        },
        entity: (chatId: string, messageId: string) =>
            queryClient.getQueryState<ChatMessageEntry>(
                chatMessageQueryKey(serverId, chatId, messageId)
            ),
        listIds(chatId: string, replyRootMessageId?: string) {
            const data = queryClient.getQueryData<InfiniteData<TranscriptPage>>(
                chatMessagesQueryOptions(
                    { client, queryClient },
                    serverId,
                    chatId,
                    replyRootMessageId ? { replyRootMessageId } : undefined
                ).queryKey
            );
            return data?.pages.flatMap((page) => page.entries.map((entry) => entry.id));
        },
    };
}

/** Polls until `done` holds, letting held reads and microtasks settle. */
export async function settle(done: () => boolean = () => true) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (done()) {
            return;
        }
    }
    throw new Error('The transcript cache did not settle.');
}

export function page(
    messages: ChatMessage[],
    {
        nextAfterSequence = null,
        nextBeforeSequence = null,
        scannedThroughSequence = messages.at(-1)?.sequence ?? 0,
        threads = [],
    }: Partial<Omit<ChatMessagePage, 'messages'>> & { threads?: ThreadSummary[] } = {}
): ChatMessagePage {
    return { messages, nextAfterSequence, nextBeforeSequence, scannedThroughSequence, threads };
}

export function message(
    chatId: string,
    sequence: number,
    overrides: Partial<ChatMessage> = {}
): ChatMessage {
    return {
        attachments: [],
        author: { kind: 'human', userId: 'usr_cache' },
        body: { kind: 'text' },
        chatId,
        cloudAgentWork: [],
        imageGenerations: [],
        content: `Message ${sequence}`,
        createdAt: new Date(Date.UTC(2026, 9, 9, 12, sequence)).toISOString(),
        id: `msg_${chatId}_${sequence}`,
        nonce: `nonce_${chatId}_${sequence}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence,
        serverId,
        sessionGeneration: null,
        ...overrides,
    };
}

export function reaction(emoji: string): ChatMessage['reactions'][number] {
    return { actors: [{ handle: null, id: 'usr_cache', kind: 'human' }], emoji };
}

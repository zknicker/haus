import {
    infiniteQueryOptions,
    type QueryClient,
    useInfiniteQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { targetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import type { HausClient } from '../../lib/transcript-list-reads.ts';
import { mergeTranscriptPages, type TranscriptPage } from './chat-message-layout.ts';

export {
    type ChatMessageLayout,
    mergeTranscriptPages,
    type TranscriptLayout,
    type TranscriptPage,
} from './chat-message-layout.ts';

export interface ChatMessagesOptions {
    /** Limits the read to one inline reply chain, including its root. */
    replyRootMessageId?: string;
}

/**
 * A transcript list: a chat's loaded message ids and layout facts, oldest
 * first. Each row reads its own message entity (`useChatMessage`). Returns
 * only the fields its readers use: React Query re-renders a reader only for
 * the result fields it touched, and spreading the result touches all of them,
 * so every kept chat view would re-render on each background fetch.
 */
export function useChatMessages(
    serverId: string | undefined,
    chatId: string | undefined,
    options?: ChatMessagesOptions
) {
    const queryClient = useQueryClient();
    const { client } = hausTrpc.useUtils();
    const {
        data: pagedData,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isPending,
        refetch,
    } = useInfiniteQuery({
        ...chatMessagesQueryOptions({ client, queryClient }, serverId ?? '', chatId ?? '', options),
        enabled: serverId !== undefined && chatId !== undefined,
    });
    const pages = pagedData?.pages;
    const data = React.useMemo(() => mergeTranscriptPages(pages), [pages]);
    const fetchOlderHistory = React.useCallback(() => fetchNextPage(), [fetchNextPage]);

    return {
        data,
        error,
        fetchOlderHistory,
        hasOlderHistory: Boolean(hasNextPage),
        isFetchingOlderHistory: isFetchingNextPage,
        isPending,
        refetch,
    };
}

/**
 * Every transcript list (a chat, an inline-reply chain, a Thread) reads its
 * pages through the coalescer, which seeds each page's `chat.message`
 * entities before the ids land and honours the read's abort signal.
 */
export function chatMessagesQueryOptions(
    { client, queryClient }: { client: HausClient; queryClient: QueryClient },
    serverId: string,
    chatId: string,
    options?: ChatMessagesOptions
) {
    const input = {
        chatId,
        limit: 50,
        ...(options?.replyRootMessageId ? { replyRootMessageId: options.replyRootMessageId } : {}),
        serverId,
    };
    const { lists } = targetedReadCoalescer(queryClient, client);
    return infiniteQueryOptions({
        ...queryPolicy.syncedSnapshot,
        getNextPageParam: (lastPage: TranscriptPage) => lastPage.nextBeforeSequence ?? undefined,
        initialPageParam: undefined as number | undefined,
        queryFn: ({ pageParam, signal }) =>
            lists.readList({ chatId, serverId }, signal, () =>
                client.chat.messages.query(
                    pageParam === undefined ? input : { ...input, beforeSequence: pageParam },
                    { signal }
                )
            ),
        queryKey: chatMessagesQueryKey(serverId, chatId, options?.replyRootMessageId),
    });
}

export function chatMessagesQueryKey(
    serverId: string,
    chatId: string,
    replyRootMessageId?: string
) {
    return getQueryKey(
        hausTrpc.chat.messages,
        {
            chatId,
            limit: 50,
            ...(replyRootMessageId ? { replyRootMessageId } : {}),
            serverId,
        },
        'infinite'
    );
}

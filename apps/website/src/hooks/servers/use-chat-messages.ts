import type { ChatMessage, ThreadSummary } from '@haus/api';
import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { type HausOutputs, hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { shareMessagePages } from './message-page-sharing.ts';

export interface ChatMessagesOptions {
    /** Limits the read to one inline reply chain, including its root. */
    replyRootMessageId?: string;
}

/**
 * A chat's loaded transcript. Returns only the fields its readers use: React
 * Query re-renders a reader only for the result fields it touched, and
 * spreading the result touches all of them, so every kept chat view would
 * re-render on each background fetch and stale flip.
 */
export function useChatMessages(
    serverId: string | undefined,
    chatId: string | undefined,
    options?: ChatMessagesOptions
) {
    const utils = hausTrpc.useUtils();
    const {
        data: pagedData,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isPending,
        refetch,
    } = useInfiniteQuery({
        ...chatMessagesQueryOptions(utils.client, serverId ?? '', chatId ?? '', options),
        enabled: serverId !== undefined && chatId !== undefined,
    });
    const pages = pagedData?.pages;
    const data = React.useMemo(() => mergeChatMessagePages(pages), [pages]);
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

export function chatMessagesQueryOptions(
    client: ReturnType<typeof hausTrpc.createClient>,
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
    const queryKey = chatMessagesQueryKey(
        input.serverId,
        input.chatId,
        options?.replyRootMessageId
    );
    return infiniteQueryOptions({
        ...queryPolicy.syncedSnapshot,
        getNextPageParam: (lastPage: ChatMessagePage) => lastPage.nextBeforeSequence ?? undefined,
        initialPageParam: undefined as number | undefined,
        queryFn: async ({ pageParam }) =>
            await client.chat.messages.query(
                pageParam === undefined ? input : { ...input, beforeSequence: pageParam }
            ),
        queryKey,
        structuralSharing: shareMessagePages,
    });
}

type ChatMessagePage = HausOutputs['chat']['messages'];

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

/** Combines newest-first cursor pages into one stable oldest-first transcript. */
export function mergeChatMessagePages(
    pages: readonly ChatMessagePage[] | undefined
): ChatMessagePage | undefined {
    if (!pages) {
        return undefined;
    }

    const messagesById = new Map<string, ChatMessage>();
    const threadsByAnchor = new Map<string, ThreadSummary>();

    for (const page of pages) {
        for (const message of page.messages) {
            if (!messagesById.has(message.id)) {
                messagesById.set(message.id, message);
            }
        }
        for (const thread of page.threads) {
            if (!threadsByAnchor.has(thread.anchorMessageId)) {
                threadsByAnchor.set(thread.anchorMessageId, thread);
            }
        }
    }

    const oldestPage = pages.at(-1);

    return {
        messages: [...messagesById.values()].sort((left, right) => left.sequence - right.sequence),
        nextBeforeSequence: oldestPage?.nextBeforeSequence ?? null,
        nextAfterSequence: pages[0]?.nextAfterSequence ?? null,
        threads: [...threadsByAnchor.values()],
    };
}

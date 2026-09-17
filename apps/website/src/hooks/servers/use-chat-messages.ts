import type { ChatMessage, ThreadSummary } from '@haus/api';
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { type HausOutputs, hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export interface ChatMessagesOptions {
    /** Limits the read to one inline reply chain, including its root. */
    replyRootMessageId?: string;
}

export function useChatMessages(
    serverId: string | undefined,
    chatId: string | undefined,
    options?: ChatMessagesOptions
) {
    const utils = hausTrpc.useUtils();
    const input = {
        chatId: chatId ?? '',
        limit: 50,
        ...(options?.replyRootMessageId ? { replyRootMessageId: options.replyRootMessageId } : {}),
        serverId: serverId ?? '',
    };
    const queryKey = chatMessagesQueryKey(
        input.serverId,
        input.chatId,
        options?.replyRootMessageId
    );
    const query = useInfiniteQuery<
        ChatMessagePage,
        Error,
        InfiniteData<ChatMessagePage>,
        typeof queryKey,
        number | undefined
    >({
        ...queryPolicy.syncedSnapshot,
        enabled: serverId !== undefined && chatId !== undefined,
        getNextPageParam: (lastPage) => lastPage.nextBeforeSequence ?? undefined,
        initialPageParam: undefined as number | undefined,
        queryFn: async ({ pageParam }) =>
            await utils.client.chat.messages.query({
                ...input,
                ...(pageParam === undefined ? {} : { beforeSequence: pageParam }),
            }),
        queryKey,
    });
    const data = React.useMemo(() => mergeChatMessagePages(query.data?.pages), [query.data?.pages]);

    return {
        ...query,
        data,
        fetchOlderHistory: () => query.fetchNextPage(),
        hasOlderHistory: Boolean(query.hasNextPage),
        isFetchingOlderHistory: query.isFetchingNextPage,
    };
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
        threads: [...threadsByAnchor.values()],
    };
}

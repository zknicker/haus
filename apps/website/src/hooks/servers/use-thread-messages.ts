import type { ChatMessage } from '@haus/api';
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { type HausOutputs, hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { shareMessagePages } from './message-page-sharing.ts';

export function useThreadMessages(serverId: string | undefined, threadChatId: string | undefined) {
    const utils = hausTrpc.useUtils();
    const input = {
        chatId: threadChatId ?? '',
        limit: 50,
        serverId: serverId ?? '',
    };
    const queryKey = threadMessagesQueryKey(input.serverId, input.chatId);
    // Named fields only: spreading the result would subscribe the Thread to
    // every fetch-status flip (see `useChatMessages`).
    const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
        useInfiniteQuery<
            ThreadMessagePage,
            Error,
            InfiniteData<ThreadMessagePage>,
            typeof queryKey,
            number | undefined
        >({
            ...queryPolicy.syncedSnapshot,
            enabled: serverId !== undefined && threadChatId !== undefined,
            getNextPageParam: (lastPage) => lastPage.nextBeforeSequence ?? undefined,
            initialPageParam: undefined as number | undefined,
            queryFn: async ({ pageParam }) =>
                await utils.client.chat.messages.query(
                    pageParam === undefined ? input : { ...input, beforeSequence: pageParam }
                ),
            queryKey,
            structuralSharing: shareMessagePages,
        });
    const pages = data?.pages;
    const messages = React.useMemo(() => mergeThreadMessagePages(pages), [pages]);

    return {
        data,
        error,
        fetchOlderHistory: fetchNextPage,
        hasOlderHistory: Boolean(hasNextPage),
        isFetchingOlderHistory: isFetchingNextPage,
        messages,
        refetch,
    };
}

type ThreadMessagePage = HausOutputs['chat']['messages'];

export function threadMessagesQueryKey(serverId: string, threadChatId: string) {
    return getQueryKey(
        hausTrpc.chat.messages,
        { chatId: threadChatId, limit: 50, serverId },
        'infinite'
    );
}

export function mergeThreadMessagePages(pages: Array<{ messages: ChatMessage[] }> | undefined) {
    const messagesById = new Map<string, ChatMessage>();

    for (let index = (pages?.length ?? 0) - 1; index >= 0; index -= 1) {
        for (const message of pages?.[index]?.messages ?? []) {
            messagesById.set(message.id, message);
        }
    }

    return [...messagesById.values()];
}

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { serverRouteModules } from '../../routes/app/server-route-modules.ts';
import { chatMessagesQueryOptions } from './use-chat-messages.ts';

type HausUtils = ReturnType<typeof hausTrpc.useUtils>;

/** Warm only the intended destination, using the same cache and freshness as its mounted reads. */
export function usePreloadChat(serverId: string, chatId: string | undefined) {
    const utils = hausTrpc.useUtils();
    const queryClient = useQueryClient();

    const preload = React.useCallback(() => {
        // The destination retries a failed module preload through its route loader.
        void serverRouteModules.chat().catch(() => undefined);
        if (!chatId) {
            return;
        }
        void preloadChatReads({ chatId, queryClient, serverId, utils });
        // The chat view's live reads; their subscriptions reconcile them on mount.
        void utils.chat.engagements.prefetch(
            { chatId, serverId },
            // Volatile state refetches only when its stream (re)starts, so warm it once.
            { staleTime: Number.POSITIVE_INFINITY }
        );
        void utils.cloudAgentWork.listForChat.prefetch(
            { chatId, serverId },
            queryPolicy.syncedSnapshot
        );
    }, [chatId, queryClient, serverId, utils]);

    // Tree items expose hover events but not React focus handlers.
    const focusRef = React.useCallback(
        (element: HTMLDivElement | null) => {
            element?.addEventListener('focus', preload);
            return () => element?.removeEventListener('focus', preload);
        },
        [preload]
    );

    return { focusRef, preload };
}

/**
 * A Chat's first paint: its record and newest message page. Every warm path
 * (hover, press, idle) goes through here so a message that lands mid-preload
 * still invalidates the in-flight read (`chat-navigation-cache.test.ts`).
 */
export function preloadChatReads({
    chatId,
    queryClient,
    serverId,
    utils,
}: {
    chatId: string;
    queryClient: QueryClient;
    serverId: string;
    utils: Pick<HausUtils, 'chat' | 'client'>;
}) {
    return Promise.all([
        utils.chat.get.prefetch({ chatId, serverId }, queryPolicy.syncedSnapshot),
        queryClient.prefetchInfiniteQuery(chatMessagesQueryOptions(utils.client, serverId, chatId)),
    ]);
}

/** Whether a Chat's first paint is already cached, fresh or not. */
export function hasCachedChatReads(
    queryClient: QueryClient,
    utils: Pick<HausUtils, 'chat' | 'client'>,
    serverId: string,
    chatId: string
) {
    return (
        utils.chat.get.getData({ chatId, serverId }) !== undefined &&
        queryClient.getQueryData(
            chatMessagesQueryOptions(utils.client, serverId, chatId).queryKey
        ) !== undefined
    );
}

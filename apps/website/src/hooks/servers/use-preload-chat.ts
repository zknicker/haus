import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { serverRouteModules } from '../../routes/app/server-route-modules.ts';
import { chatMessagesQueryOptions } from './use-chat-messages.ts';

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
        void utils.chat.get.prefetch({ chatId, serverId }, queryPolicy.syncedSnapshot);
        void queryClient.prefetchInfiniteQuery(
            chatMessagesQueryOptions(utils.client, serverId, chatId)
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

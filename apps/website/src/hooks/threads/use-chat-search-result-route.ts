import type { ChatSearchResult } from '@haus/api';
import { useCallback } from 'react';
import { serverChatRoute } from '../../features/servers/server-routes.ts';
import { useThreadRoute } from './use-thread-opener.ts';

/** A Search result's address: its Chat, or its Thread landed on the matched reply. */
export function useChatSearchResultRoute(slug: string) {
    const threadRoute = useThreadRoute(slug);
    return useCallback(
        (result: ChatSearchResult) =>
            result.thread
                ? threadRoute(
                      result.thread.parentChatId,
                      result.thread.anchorMessageId,
                      result.sequence
                  )
                : serverChatRoute(slug, result.chatId),
        [slug, threadRoute]
    );
}

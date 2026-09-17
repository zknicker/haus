import * as React from 'react';
import {
    type ThreadInlineReplyHistory,
    threadInlineReplyMessages,
} from '../../features/servers/thread/thread-inline-replies.ts';
import { useChatMessages } from './use-chat-messages.ts';

/** Loads the parent Chat exchange shown by a focused conversation. */
export function useThreadInlineReplies(
    serverId: string,
    chatId: string | undefined,
    anchorMessageId: string | undefined
) {
    const query = useChatMessages(serverId, anchorMessageId ? chatId : undefined, {
        replyRootMessageId: anchorMessageId,
    });
    const history = React.useMemo<ThreadInlineReplyHistory | undefined>(
        () =>
            anchorMessageId
                ? {
                      fetchOlder: () => {
                          void query.fetchOlderHistory();
                      },
                      hasOlder: query.hasOlderHistory,
                      error: query.error?.message ?? null,
                      isFetching: query.isFetchingOlderHistory,
                      retry: () => {
                          void query.refetch();
                      },
                  }
                : undefined,
        [
            anchorMessageId,
            query.fetchOlderHistory,
            query.hasOlderHistory,
            query.isFetchingOlderHistory,
            query.error?.message,
            query.refetch,
        ]
    );
    const messages = anchorMessageId
        ? threadInlineReplyMessages(query.data?.messages, anchorMessageId)
        : undefined;

    return { history, messages };
}

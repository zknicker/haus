import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { subscribeChatPurges } from '../../lib/targeted-read-coalescer.ts';

/**
 * Whether this Chat was purged while mounted: by `chat.onLifecycle` `deleted`,
 * or by a per-Chat stream refused with `chat_missing` (a desktop tab restored
 * onto a Chat deleted while the App was away). A per-Chat stream ANDs `!lost`
 * into its `enabled`, the Chat-level twin of `useServerStreamsOpen`: a view
 * still showing a deleted Chat stops its streams instead of retrying against a
 * Chat the Server no longer has.
 */
export function useChatLost(serverId: string | undefined, chatId: string | undefined): boolean {
    const queryClient = useQueryClient();
    const key = chatId === undefined ? null : `${serverId ?? ''}\u0000${chatId}`;
    const [lost, setLost] = React.useState<string | null>(null);
    React.useEffect(
        () =>
            subscribeChatPurges(queryClient, (scope) => {
                if (scope.serverId === serverId && scope.chatId === chatId) {
                    setLost(key);
                }
            }),
        [chatId, key, queryClient, serverId]
    );
    return key !== null && lost === key;
}

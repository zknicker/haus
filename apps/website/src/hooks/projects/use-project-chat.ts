import type { Chat } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useListedChat } from '../servers/use-chats.ts';

export function useProjectChat(serverId: string, chatId: string) {
    const listed = useListedChat(serverId, chatId);
    const select = React.useCallback(
        (chats: Chat[]) => chats.find((chat) => chat.id === chatId),
        [chatId]
    );
    const archived = hausTrpc.chat.listArchived.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, enabled: listed === undefined, select }
    ).data;
    return listed ?? archived;
}

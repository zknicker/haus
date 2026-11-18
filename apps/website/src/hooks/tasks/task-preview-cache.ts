import type { QueryClient } from '@tanstack/react-query';

import {
    type ChatMessageEntry,
    chatMessageFamilyKey,
    chatMessageQueryInput,
} from '../servers/chat-message-entities.ts';

export function findTaskPreviewOrigin(
    queryClient: QueryClient,
    serverId: string,
    taskId: string
): string | null {
    for (const query of queryClient.getQueryCache().findAll({ queryKey: chatMessageFamilyKey })) {
        const input = chatMessageQueryInput(query);
        const entry = query.state.data as ChatMessageEntry | undefined;
        if (input?.serverId === serverId && entry?.tasks.some((task) => task.taskId === taskId)) {
            return input.chatId;
        }
    }
    return null;
}

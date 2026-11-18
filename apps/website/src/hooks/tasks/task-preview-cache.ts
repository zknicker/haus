import type { QueryClient } from '@tanstack/react-query';
import {
    type ChatMessageEntry,
    chatMessageFamilyKey,
    chatMessageQueryInput,
} from '../servers/chat-message-entities.ts';

/**
 * The Task previews under one origin Message (ADR 0052 decision 7) have one
 * owner: the Message's `chat.message` entity. `chat.messages` pages and
 * `chat.message` reads carry `tasks`, and every read seeds each entity with
 * the Tasks started from it (`chat-message-entities.ts`); the entity's
 * projected row carries them to the preview (`chat-message-projection.ts`).
 * Reads here only derive from those entities; nothing writes or fetches.
 */

/** The origin Chat of a cached preview for this Task, or null when none is cached. */
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

import { chatLifecycleTopic } from '../realtime/topics.ts';

export type ChatLifecycleAction = 'archived' | 'created' | 'deleted' | 'unarchived' | 'updated';

/**
 * Prepares `chat.lifecycle` for a Chat change the caller is about to commit.
 * Chat-access scoped on delivery, except `deleted`, which reaches every Server
 * member because the Chat is already gone from access.
 */
export function prepareLifecycleEvent(
    input: { chatId: string; serverId: string },
    action: ChatLifecycleAction
) {
    return chatLifecycleTopic.prepare({
        action,
        chatId: input.chatId,
        serverId: input.serverId,
    });
}

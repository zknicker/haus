import type { HausDatabase } from '../postgres/connection.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { reopenTaskOnPost } from '../tasks/task-chat.ts';
import { prepareTaskUpdatedEvent } from '../tasks/task-events.ts';
import { followTask, followTaskMentions } from '../tasks/task-follows.ts';

/** Where a message was just written, as the send transaction knows it. */
export interface PostPlace {
    chatId: string;
    kind: 'channel' | 'dm' | 'task';
    parentChatId: string | null;
    serverId: string;
}

type PostAuthor = { kind: 'agent'; agentId: string } | { kind: 'user'; userId: string };

/**
 * What posting does to the place a message lands in, for human and Agent sends
 * alike, inside the send's transaction. In a Task (ADR 0053) the author and
 * mentioned people follow it, and posting in a done or canceled Task reopens
 * it. Returns `task.updated` for a reopen. Channels and DMs have no follows.
 */
export async function applyPostFollows(
    tx: HausDatabase,
    place: PostPlace,
    post: { author: PostAuthor; content: string; mentionedUserIds: readonly string[] }
): Promise<PreparedRealtimeEvent[]> {
    const { chatId, serverId } = place;
    if (place.kind !== 'task') {
        return [];
    }
    await followTask(tx, { actor: post.author, chatId, serverId });
    await followTaskMentions(tx, { chatId, mentionedUserIds: post.mentionedUserIds, serverId });
    const reopened = await reopenTaskOnPost(tx, { chatId, serverId });
    return reopened
        ? [
              prepareTaskUpdatedEvent({
                  chatId: reopened.chatId,
                  id: reopened.taskId,
                  serverId,
                  version: reopened.version,
              }),
          ]
        : [];
}

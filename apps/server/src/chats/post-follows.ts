import type { HausDatabase } from '../postgres/connection.ts';
import { followTask, followTaskMentions } from '../tasks/task-follows.ts';

export interface PostPlace {
    chatId: string;
    kind: 'channel' | 'dm' | 'task';
    parentChatId: string | null;
    serverId: string;
}

type PostAuthor = { kind: 'agent'; agentId: string } | { kind: 'user'; userId: string };

export async function applyPostFollows(
    tx: HausDatabase,
    place: PostPlace,
    post: { author: PostAuthor; content: string; mentionedUserIds: readonly string[] }
) {
    const { chatId, serverId } = place;
    if (place.kind !== 'task') {
        return;
    }
    await followTask(tx, { actor: post.author, chatId, serverId });
    await followTaskMentions(tx, { chatId, mentionedUserIds: post.mentionedUserIds, serverId });
}

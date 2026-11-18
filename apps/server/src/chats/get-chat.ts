import type { Chat } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ChatNotFoundError } from './chat-access.ts';
import { listChats } from './list-chats.ts';

export async function getChat(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId: string; serverId: string }
): Promise<Chat> {
    const chat = (await listChats(db, member, input.serverId, 'all')).find(
        (candidate) => candidate.id === input.chatId
    );
    if (!chat) {
        throw new ChatNotFoundError();
    }
    return chat;
}

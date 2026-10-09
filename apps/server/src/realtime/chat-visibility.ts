import { findChatAccess } from '../chats/chat-access.ts';
import type { RealtimeAccess } from './subscription.ts';

/** Chat-scoped streams deliver an event only to a member who can open its Chat. */
export async function canSeeChat(
    { db, member }: RealtimeAccess,
    event: { chatId: string; serverId: string }
): Promise<boolean> {
    const chat = await findChatAccess(db, member.id, {
        chatId: event.chatId,
        serverId: event.serverId,
    });
    return chat !== null;
}

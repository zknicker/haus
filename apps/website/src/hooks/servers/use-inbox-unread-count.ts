import { selectUnreadChats } from '../../features/servers/inbox/unread-chats.ts';
import { useChats } from './use-chats.ts';

/**
 * How many Chats the Inbox lists as Unread, for surfaces that badge the Inbox
 * instead of opening it. It reads the same `chat.list` the section renders,
 * so the badge and the section never disagree, and it reports zero until
 * that read settles.
 */
export function useInboxUnreadCount(serverId: string | undefined): {
    count: number;
    isReady: boolean;
} {
    const chats = useChats(serverId);

    return {
        count: chats.data ? selectUnreadChats(chats.data).length : 0,
        isReady: chats.data !== undefined,
    };
}

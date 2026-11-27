import type { Chat, ChatUnreadPreview } from '@haus/api';
import { captainChatRoute } from '../agent-panel/captain-chat-route.ts';
import { serverChatRoute, taskRoute } from '../servers/server-routes.ts';
import { orderChannelIds } from '../shell/channel-order.ts';
import type { CapySidebarSection } from './sidebar-layout.ts';
import { taskUnread } from './sidebar-model.ts';

export interface WalkRow {
    href: string;
    unread: boolean;
}

export type WalkDirection = 'next' | 'previous';

export function walkRows({
    channelOrder,
    chats,
    previews,
    sections,
    slug,
}: {
    channelOrder: readonly string[];
    chats: readonly Chat[];
    previews: readonly ChatUnreadPreview[];
    sections: readonly CapySidebarSection[];
    slug: string;
}) {
    const unreadByChat = new Map(chats.map((chat) => [chat.id, chat.unreadCount > 0]));
    const chatRow = (chatId: string) => ({
        href: serverChatRoute(slug, chatId),
        unread: unreadByChat.get(chatId) ?? false,
    });
    return sections.flatMap((section) => {
        switch (section.kind) {
            case 'captains':
                return section.agentIds.map((agentId) => {
                    const dmChatId = section.agentDmChatIds[agentId];
                    return dmChatId
                        ? chatRow(dmChatId)
                        : { href: captainChatRoute(slug, agentId), unread: false };
                });
            case 'projects':
                return [
                    ...(section.teamRoomId ? [section.teamRoomId] : []),
                    ...orderChannelIds(section.chatIds, channelOrder),
                ].map(chatRow);
            case 'people':
                return section.chatIds.map(chatRow);
            default:
                return section.tasks.map((task) => ({
                    href: taskRoute(slug, task.shortId),
                    unread:
                        taskUnread(
                            previews.find((preview) => preview.chatId === task.chatId),
                            null
                        ).unreadCount > 0,
                }));
        }
    });
}

export function nextUnreadHref(
    rows: readonly WalkRow[],
    currentHref: string,
    direction: WalkDirection
) {
    const step = direction === 'next' ? 1 : -1;
    const current = rows.findIndex((row) => row.href === currentHref);
    const start = current === -1 ? (direction === 'next' ? -1 : rows.length) : current;
    for (let offset = 1; offset <= rows.length; offset += 1) {
        const index = (start + step * offset + rows.length * 2) % rows.length;
        const row = rows[index];
        if (row?.unread && row.href !== currentHref) {
            return row.href;
        }
    }
    return null;
}

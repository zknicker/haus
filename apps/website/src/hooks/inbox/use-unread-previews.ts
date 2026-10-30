import type { ChatUnreadPreview, ChatUnreadPreviewList } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One unread Inbox row's waiting messages (`chat.unreadPreviews`), selected
 * from the one Server-wide read every row shares (ADR 0050). `chatId` is the
 * Channel or DM id, or a Thread's own `threadChatId`.
 *
 * Undefined while the read has not settled; null when it settled without this
 * row, which happens for a moment when a row arrives before the previews
 * refetch that names it. Each row selects only its own preview, so a new
 * message re-renders the row it landed in, not the whole list. The read is
 * invalidated by the streams that already move unread state
 * (`message.created`, `chat.onRead`, Thread follows, Chat lifecycle).
 */
export function useUnreadPreview(
    serverId: string,
    chatId: string
): ChatUnreadPreview | null | undefined {
    const select = React.useCallback(
        (list: ChatUnreadPreviewList) => findUnreadPreview(list, chatId),
        [chatId]
    );
    const { data } = hausTrpc.chat.unreadPreviews.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select }
    );
    return data;
}

/** The row's preview in one settled list, or null when the list does not name it. */
export function findUnreadPreview(
    list: ChatUnreadPreviewList,
    chatId: string
): ChatUnreadPreview | null {
    return list.previews.find((preview) => preview.chatId === chatId) ?? null;
}

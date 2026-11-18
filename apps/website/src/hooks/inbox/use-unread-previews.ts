import type { ChatUnreadPreview, ChatUnreadPreviewList } from '@haus/api';
import * as React from 'react';

import {
    type FollowedTaskPreview,
    followedTaskPreviews,
} from '../../features/servers/inbox/unread-rows.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

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

/**
 * Whether the previews read has answered, success or failure. The Unread list
 * waits on it as well as on its rows, so the cards and their messages land in
 * one frame instead of each card growing under a painted list. It
 * reads only the status, so a refetch that changes the previews never
 * re-renders the list.
 */
export function useUnreadPreviewsSettled(serverId: string): boolean {
    const { status } = hausTrpc.chat.unreadPreviews.useQuery(
        { serverId },
        queryPolicy.syncedSnapshot
    );
    return status !== 'pending';
}

/**
 * Reads one row's preview from the cached previews when called, for an action
 * (opening a card at its message) rather than a render, so it subscribes to nothing.
 */
export function useUnreadPreviewReader(serverId: string) {
    const utils = hausTrpc.useUtils();
    return React.useCallback(
        (chatId: string): ChatUnreadPreview | null => {
            const list = utils.chat.unreadPreviews.getData({ serverId });
            return list ? findUnreadPreview(list, chatId) : null;
        },
        [serverId, utils]
    );
}

/** Warms the previews read on intent (hovering Inbox), with the freshness its rows read it at. */
export function usePreloadUnreadPreviews(serverId: string) {
    const utils = hausTrpc.useUtils();
    return React.useCallback(() => {
        void utils.chat.unreadPreviews.prefetch({ serverId }, queryPolicy.syncedSnapshot);
    }, [serverId, utils]);
}

/** The row's preview in one settled list, or null when the list does not name it. */
export function findUnreadPreview(
    list: ChatUnreadPreviewList,
    chatId: string
): ChatUnreadPreview | null {
    return list.previews.find((preview) => preview.chatId === chatId) ?? null;
}

export function useFollowedTaskPreviews(serverId: string): FollowedTaskPreview[] | undefined {
    const { data } = hausTrpc.chat.unreadPreviews.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: selectFollowedTaskPreviews }
    );
    return data;
}

function selectFollowedTaskPreviews({ previews }: ChatUnreadPreviewList) {
    return followedTaskPreviews(previews);
}

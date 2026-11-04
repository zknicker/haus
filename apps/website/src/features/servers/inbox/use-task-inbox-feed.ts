import type { Board, Chat, TaskInboxItem } from '@haus/api';
import * as React from 'react';
import { useBoards } from '../../../hooks/boards/use-boards.ts';
import { useTaskContextThreads } from '../../../hooks/task-inbox/use-task-context-threads.ts';
import { useTaskInboxItems } from '../../../hooks/task-inbox/use-task-inbox-items.ts';
import {
    type TaskContextPlace,
    taskContextPlace,
    taskContextThreadChatIds,
} from './task-inbox-model.ts';

const noItems: readonly TaskInboxItem[] = [];

/**
 * What the Unread feed needs for its Task cards, all Server-wide reads: the
 * items, the boards their columns come from, and the Threads their context
 * messages sit in. `settled` holds the list back until every card can paint
 * whole, so none grows under the reader (ADR 0050); a board or Thread read a
 * reader with no Task items never needs does not hold it.
 */
export function useTaskInboxFeed(serverId: string, chats: readonly Chat[] | undefined) {
    const itemsRead = useTaskInboxItems(serverId);
    const boardsRead = useBoards(serverId);
    const items = itemsRead.data ?? noItems;
    const chatById = React.useMemo(
        () => new Map((chats ?? []).map((chat) => [chat.id, chat])),
        [chats]
    );
    const threadChatIds = React.useMemo(
        () => (chats ? taskContextThreadChatIds(items, chatById) : []),
        [chats, chatById, items]
    );
    const context = useTaskContextThreads(serverId, threadChatIds);
    const threadByChatId = React.useMemo(
        () => new Map(context.threads.map((thread) => [thread.threadChatId, thread])),
        [context.threads]
    );
    const boardById = React.useMemo(
        () => new Map((boardsRead.data ?? []).map((board) => [board.id, board])),
        [boardsRead.data]
    );

    return {
        /** A board `board.list` leaves out (an archived one) has no columns to offer. */
        boardOf: (item: TaskInboxItem): Board | null => boardById.get(item.task.boardId) ?? null,
        items,
        placeOf: (item: TaskInboxItem): null | TaskContextPlace =>
            taskContextPlace(item.contextMessage, chatById, threadByChatId),
        settled:
            itemsRead.status !== 'pending' &&
            (items.length === 0 || (boardsRead.status !== 'pending' && context.settled)),
    };
}

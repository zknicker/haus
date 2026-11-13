import type { Board, Chat, TaskInboxItem } from '@haus/api';
import * as React from 'react';
import { useBoards } from '../../../hooks/boards/use-boards.ts';
import { useTaskInboxItems } from '../../../hooks/task-inbox/use-task-inbox-items.ts';
import { type TaskReplyPlace, taskReplyPlace } from './task-inbox-model.ts';

const noItems: readonly TaskInboxItem[] = [];

/**
 * What the Unread feed needs for its Task cards, both Server-wide reads: the
 * items, which name where their context messages live, and the boards their
 * columns come from. `settled` holds the list back until every card can paint
 * whole, so none grows under the reader (ADR 0050); a board read a reader with
 * no Task items never needs does not hold it.
 */
export function useTaskInboxFeed(serverId: string, chats: readonly Chat[] | undefined) {
    const itemsRead = useTaskInboxItems(serverId);
    const boardsRead = useBoards(serverId);
    const items = itemsRead.data ?? noItems;
    const chatById = React.useMemo(
        () => new Map((chats ?? []).map((chat) => [chat.id, chat])),
        [chats]
    );
    const boardById = React.useMemo(
        () => new Map((boardsRead.data ?? []).map((board) => [board.id, board])),
        [boardsRead.data]
    );

    return {
        /** A board `board.list` leaves out (an archived one) has no columns to offer. */
        boardOf: (item: TaskInboxItem): Board | null => boardById.get(item.task.boardId) ?? null,
        items,
        replyPlaceOf: (item: TaskInboxItem): null | TaskReplyPlace =>
            taskReplyPlace(item, chatById),
        settled:
            itemsRead.status !== 'pending' &&
            (items.length === 0 || boardsRead.status !== 'pending'),
    };
}

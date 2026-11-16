import type {
    Board,
    BoardColumn,
    Chat,
    ColumnCategory,
    Task,
    TaskInboxItem,
    TaskMutationResult,
} from '@haus/api';
import type { UnreadRow } from './unread-rows.ts';

/** A resolve button on a Task card: the column it moves the Task to. */
export interface TaskResolveAction {
    column: BoardColumn;
    label: string;
}

const resolveCategories: readonly { category: ColumnCategory; label: string }[] = [
    { category: 'active', label: 'Start' },
    { category: 'done', label: 'Done' },
    { category: 'canceled', label: "Won't do" },
];

/**
 * Start, Done, and Won't do (ADR 0051): each moves the Task to the board's
 * first column of that category. A Task already in the category keeps its
 * place, since moving within it would move nothing a reader asked for; a board
 * with no `canceled` column has no Won't do.
 */
export function taskResolveActions(
    board: Pick<Board, 'columns'>,
    task: Pick<Task, 'category'>
): TaskResolveAction[] {
    return resolveCategories.flatMap(({ category, label }) => {
        const column = board.columns.find((candidate) => candidate.category === category);
        return column && task.category !== category ? [{ column, label }] : [];
    });
}

/** Where a Task card's composer replies. */
export interface TaskReplyPlace {
    /** The message the reply's Thread hangs off: the context message, or its Thread's anchor. */
    anchorMessageId: string;
    /** The Channel or DM. */
    parent: Chat;
}

/**
 * Where a card's reply goes, from the place `taskInbox.list` names. Null with
 * no context message, or when the Chat is not one the reader holds, and then
 * the card has no composer.
 */
export function taskReplyPlace(
    { contextMessage, contextPlace }: Pick<TaskInboxItem, 'contextMessage' | 'contextPlace'>,
    chats: ReadonlyMap<string, Chat>
): null | TaskReplyPlace {
    const parent = contextPlace ? chats.get(contextPlace.chatId) : undefined;
    return contextMessage && contextPlace && parent
        ? {
              anchorMessageId: contextPlace.threadAnchorMessageId ?? contextMessage.id,
              parent,
          }
        : null;
}

/** The reader's newest resolve, kept as a slim row where its card was so it can be undone. */
export interface ResolvedTask {
    column: BoardColumn;
    /** Where the card sat in the queue. */
    index: number;
    item: TaskInboxItem;
    /** The move's ack: Undo moves back from the version it returns. */
    moved: Promise<TaskMutationResult>;
}

/** A feed row: a queue card, or the slim row a resolve left, which no key ever lands on. */
export type UnreadFeedRow =
    | UnreadRow
    | { id: string; kind: 'task-resolved'; resolved: ResolvedTask };

/** The queue with the newest resolve's slim row back in the place its card held. */
export function withResolvedRow(
    rows: readonly UnreadRow[],
    resolved: null | ResolvedTask
): readonly UnreadFeedRow[] {
    if (!resolved) {
        return rows;
    }
    const index = Math.min(resolved.index, rows.length);
    return [
        ...rows.slice(0, index),
        { id: `resolved:${resolved.item.task.id}`, kind: 'task-resolved', resolved },
        ...rows.slice(index),
    ];
}

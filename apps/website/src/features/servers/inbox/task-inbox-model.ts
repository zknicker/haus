import type {
    Board,
    BoardColumn,
    Chat,
    ChatMessage,
    ColumnCategory,
    Task,
    TaskInboxItem,
    TaskMutationResult,
} from '@haus/api';
import type { TaskContextThread } from '../../../hooks/task-inbox/use-task-context-threads.ts';
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

/** Where a Task card's context message lives, and so where its composer replies. */
export interface TaskContextPlace {
    /** The message the reply's Thread hangs off: the context message, or its Thread's anchor. */
    anchorMessageId: string;
    /** The Channel or DM. */
    parent: Chat;
    /** Set when the context message is itself a Thread reply. */
    threadChatId: null | string;
}

/**
 * Context messages that sit in a Chat the list does not name: Thread replies,
 * whose parent and anchor `taskInbox.list` leaves out. Sorted, so the read they
 * key is stable while the feed reorders.
 */
export function taskContextThreadChatIds(
    items: readonly TaskInboxItem[],
    chats: ReadonlyMap<string, Chat>
): string[] {
    const ids = items.flatMap(({ contextMessage }) =>
        contextMessage && !chats.has(contextMessage.chatId) ? [contextMessage.chatId] : []
    );
    return [...new Set(ids)].sort();
}

/**
 * The place of a context message: its own Chat, or the Chat its Thread hangs
 * off. Null with no message, or until its Thread resolves, or when the Chat is
 * not one the reader holds, and then the card has no composer.
 */
export function taskContextPlace(
    message: ChatMessage | null,
    chats: ReadonlyMap<string, Chat>,
    threads: ReadonlyMap<string, TaskContextThread>
): null | TaskContextPlace {
    if (!message) {
        return null;
    }
    const chat = chats.get(message.chatId);
    if (chat) {
        return { anchorMessageId: message.id, parent: chat, threadChatId: null };
    }
    const thread = threads.get(message.chatId);
    const parent = thread ? chats.get(thread.parentChatId) : undefined;
    return thread && parent
        ? {
              anchorMessageId: thread.anchorMessageId,
              parent,
              threadChatId: thread.threadChatId,
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

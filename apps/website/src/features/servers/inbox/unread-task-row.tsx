import type {
    Board,
    BoardColumn,
    ChatMessage,
    Task,
    TaskInboxItem,
    TaskMessagePlace,
} from '@haus/api';
import { Button } from '@heroui/react';
import { KanbanIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { opensPlace } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { TaskDueDate } from '../../tasks/task-facts.tsx';
import { taskMessagePlaceLabel, taskPriorityLabels } from '../../tasks/task-presentation.ts';
import { TaskPriorityIcon } from '../../tasks/task-priority-icon.tsx';
import { threadTitles } from '../thread/thread-target.ts';
import { replyInto } from './inbox-unread-row.tsx';
import { TaskColumnPicker } from './task-column-picker.tsx';
import { type TaskReplyPlace, taskResolveActions } from './task-inbox-model.ts';
import { UnreadRowComposer, type UnreadRowReply } from './unread-row-composer.tsx';
import { ClampedMessages } from './unread-row-content.tsx';
import { UnreadRowHeader } from './unread-row-header.tsx';
import { MarkReadAction, UnreadRowTime } from './unread-row-parts.tsx';
import { UnreadCardShell, type UnreadRowTriage } from './unread-triage-row.tsx';

/**
 * A Task assigned to the reader, as a card in the Unread feed (ADR 0051): one
 * per Task. It names the board, the key, and who assigned it; the Task's own
 * facts; its context message, the newest message referencing it; and that
 * message's Thread composer, so discussion stays where the Task already lives.
 * Start, Done, Won't do, and the status picker resolve the Task in place.
 *
 * Mark read sits where every Unread card has it. A reply does not clear the
 * card: the Task is still the reader's to resolve.
 */
export function UnreadTaskRow({
    board,
    item,
    onOpenContext,
    onResolve,
    replyPlace,
    serverId,
    triage,
}: {
    /** Null for a board `board.list` leaves out, which offers no columns to move to. */
    board: Board | null;
    item: TaskInboxItem;
    /** Opens the context message's conversation. */
    onOpenContext: () => void;
    onResolve: (column: BoardColumn) => void;
    replyPlace: null | TaskReplyPlace;
    serverId: string;
    triage: UnreadRowTriage;
}) {
    const { assignedAt, assignedBy, boardName, contextMessage, contextPlace, task } = item;
    const humans = useHumanDirectory(serverId);
    const reply: UnreadRowReply = replyPlace
        ? replyInto(
              replyPlace.parent,
              threadTitles(replyPlace.parent, replyPlace.anchorMessageId, humans).header,
              { anchorMessageId: replyPlace.anchorMessageId, kind: 'thread' }
          )
        : { kind: 'closed' };

    return (
        <UnreadCardShell label={`${task.key}: ${task.title}`} triage={triage}>
            <UnreadRowHeader
                actions={<MarkReadAction onPress={triage.onMarkRead} title={task.key} />}
                count={null}
                label={`Open ${task.key}`}
                mark={<BoardMark />}
                note={`${task.key} · ${assignedBy.label} assigned you`}
                onOpen={() => triage.onOpen()}
                takesFocus={triage.takesFocus}
                time={<UnreadRowTime value={assignedAt} />}
                title={boardName}
            />
            <TaskFacts board={board} onResolve={onResolve} task={task} />
            {contextMessage && contextPlace ? (
                <ContextMessage
                    message={contextMessage}
                    onOpen={onOpenContext}
                    place={contextPlace}
                    serverId={serverId}
                />
            ) : null}
            <UnreadRowComposer
                onSent={triage.onReplySent}
                ref={triage.isSelected ? triage.composerRef : null}
                reply={reply}
            />
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 pb-3">
                {board
                    ? taskResolveActions(board, task).map(({ column, label }) => (
                          <Button
                              key={label}
                              onPress={() => onResolve(column)}
                              size="sm"
                              variant="secondary"
                          >
                              {label}
                          </Button>
                      ))
                    : null}
                <Button
                    className="ms-auto"
                    onPress={() => triage.onOpen()}
                    size="sm"
                    variant="ghost"
                    {...opensPlace}
                >
                    Open task
                </Button>
            </div>
        </UnreadCardShell>
    );
}

/** The title line: priority, title, due day, and the status picker. */
function TaskFacts({
    board,
    onResolve,
    task,
}: {
    board: Board | null;
    onResolve: (column: BoardColumn) => void;
    task: Task;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2 px-4 pb-2">
            {task.priority === 'none' ? null : (
                <span
                    aria-label={`${taskPriorityLabels[task.priority]} priority`}
                    className="flex shrink-0 text-muted"
                    role="img"
                >
                    <TaskPriorityIcon priority={task.priority} />
                </span>
            )}
            <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
                {task.title}
            </span>
            {task.dueOn ? (
                <span className="flex shrink-0 items-baseline gap-1 text-muted text-xs">
                    Due <TaskDueDate task={task} />
                </span>
            ) : null}
            {board ? <TaskColumnPicker board={board} onMove={onResolve} task={task} /> : null}
        </div>
    );
}

/** The newest message referencing the Task, under a line naming where it was written. */
function ContextMessage({
    message,
    onOpen,
    place,
    serverId,
}: {
    message: ChatMessage;
    onOpen: () => void;
    place: TaskMessagePlace;
    serverId: string;
}) {
    const messages = React.useMemo(() => [message], [message]);

    return (
        <div className="flex min-w-0 flex-col pb-1">
            <button
                className="mb-1 self-start rounded-sm px-4 text-muted text-xs outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus"
                onClick={onOpen}
                type="button"
                {...opensPlace}
            >
                {taskMessagePlaceLabel(place)}
            </button>
            <ClampedMessages
                chatId={message.chatId}
                conversationChatId={place.chatId}
                messages={messages}
                onOpen={onOpen}
                serverId={serverId}
            />
        </div>
    );
}

/** A board's mark at the sidebar's 24px, the size every Unread card's place wears. */
function BoardMark() {
    return (
        <span className="flex size-6 shrink-0 items-center justify-center text-muted">
            <Icon icon={KanbanIcon} size={18} />
        </span>
    );
}

import { Kanban } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { LabelChip } from '../../tasks/label-chip.tsx';
import { taskPriorityLabels, taskStatusLabels } from '../../tasks/task-presentation.ts';
import { TaskPriorityIcon } from '../../tasks/task-priority-icon.tsx';
import { TaskStatusDisc } from '../../tasks/task-status-disc.tsx';
import { TaskActions } from './task-actions.tsx';
import { TaskContextMenu } from './task-context-menu.tsx';
import { groupTasks, groupTasksForList, type TaskItem } from './task-model.ts';

interface TaskViewProps {
    onOpenTask: (task: TaskItem) => void;
    tasks: TaskItem[];
}

export function TaskBoard({ onOpenTask, tasks }: TaskViewProps) {
    const groups = React.useMemo(() => groupTasks(tasks), [tasks]);

    return (
        <div className="min-h-0 flex-1 p-4">
            <Kanban>
                {groups.map((group) => (
                    <Kanban.Column key={group.status}>
                        <Kanban.ColumnHeader>
                            <Kanban.ColumnIndicator>
                                <TaskStatusDisc className="size-4" status={group.status} />
                            </Kanban.ColumnIndicator>
                            <Kanban.ColumnTitle>
                                {taskStatusLabels[group.status]}
                            </Kanban.ColumnTitle>
                            <Kanban.ColumnCount>{group.tasks.length}</Kanban.ColumnCount>
                        </Kanban.ColumnHeader>
                        <Kanban.ColumnBody>
                            <Kanban.CardList
                                aria-label={`${taskStatusLabels[group.status]} tasks`}
                                items={group.tasks}
                                renderEmptyState={() =>
                                    `No ${taskStatusLabels[group.status].toLowerCase()} tasks.`
                                }
                            >
                                {(task) => (
                                    <Kanban.Card id={task.id} textValue={task.title}>
                                        <TaskContextMenu onOpenTask={onOpenTask} task={task}>
                                            <TaskSummary onOpen={onOpenTask} task={task} />
                                            <TaskActions task={task} />
                                        </TaskContextMenu>
                                    </Kanban.Card>
                                )}
                            </Kanban.CardList>
                        </Kanban.ColumnBody>
                    </Kanban.Column>
                ))}
            </Kanban>
        </div>
    );
}

/**
 * Linear-style grouped list: collapsible status groups with dense
 * display-only rows; opening the task is the row action, and metadata
 * edits live on the board cards and the task thread.
 */
export function TaskList({ onOpenTask, tasks }: TaskViewProps) {
    const groups = React.useMemo(
        () => groupTasksForList(tasks).filter((group) => group.tasks.length > 0),
        [tasks]
    );

    return (
        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
            {groups.map((group) => (
                <TaskListGroup
                    key={group.key}
                    onOpen={onOpenTask}
                    status={group.status}
                    tasks={group.tasks}
                    title={group.title}
                />
            ))}
        </div>
    );
}

function TaskListGroup({
    onOpen,
    status,
    tasks,
    title,
}: {
    onOpen: (task: TaskItem) => void;
    status: TaskItem['status'];
    tasks: TaskItem[];
    title: string;
}) {
    const [open, setOpen] = React.useState(true);

    return (
        // Each group closes with its own border: row dividers stop after the
        // last row, and this seam doubles as the line before the next header.
        <section className="border-separator border-b">
            <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-separator border-b bg-background/80 px-3 backdrop-blur">
                <button
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 cursor-[var(--cursor-interactive)] items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    onClick={() => setOpen((value) => !value)}
                    type="button"
                >
                    <Icon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted transition-transform duration-150"
                        icon={ArrowRight01Icon}
                        style={{ transform: open ? 'rotate(90deg)' : 'none' }}
                    />
                    <TaskStatusDisc className="size-4" status={status} />
                    <span className="font-semibold text-foreground text-sm">{title}</span>
                    <span className="text-muted text-xs tabular-nums">{tasks.length}</span>
                </button>
            </div>
            <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
            >
                <div className="overflow-hidden">
                    <div className="divide-y divide-separator">
                        {tasks.map((task) => (
                            <TaskListRow
                                assigneeLabel={task.assigneeLabel}
                                key={task.id}
                                onOpen={onOpen}
                                task={task}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function TaskListRow({
    assigneeLabel,
    onOpen,
    task,
}: {
    assigneeLabel: string;
    onOpen: (task: TaskItem) => void;
    task: TaskItem;
}) {
    return (
        <TaskContextMenu onOpenTask={onOpen} task={task}>
            <button
                aria-label={rowAriaLabel(task, assigneeLabel)}
                className="flex h-9 w-full cursor-[var(--cursor-interactive)] items-center gap-2 px-3 text-left outline-none hover:bg-background-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
                onClick={() => onOpen(task)}
                type="button"
            >
                <TaskPriorityIcon className="size-4 text-muted" priority={task.priority} />
                <span className="w-10 shrink-0 text-right font-mono text-muted text-xs tabular-nums">
                    #{task.number}
                </span>
                <TaskStatusDisc className="size-4" status={task.status} />
                <span className="min-w-0 flex-1 truncate text-foreground text-sm">
                    {task.title}
                </span>
                <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
                    <TaskBackgroundLabel tier={task.tier} />
                    {task.labels.map((label) => (
                        <LabelChip color={label.color} key={label.id} name={label.name} />
                    ))}
                    <span className="text-muted text-sm">{task.chatLabel}</span>
                </div>
                <span className="hidden shrink-0 text-muted text-xs tabular-nums sm:inline">
                    <RelativeTime value={task.updatedAt} />
                </span>
                <span className="shrink-0" title={assigneeLabel}>
                    {task.assigneeAgentId !== null ? (
                        <EntityAvatar name={assigneeLabel} size={20} src={task.assigneeAvatarUrl} />
                    ) : (
                        <span
                            aria-hidden="true"
                            className="block size-5 rounded-full border border-separator border-dashed"
                        />
                    )}
                </span>
            </button>
        </TaskContextMenu>
    );
}

function rowAriaLabel(task: TaskItem, assigneeLabel: string) {
    const priority =
        task.priority === 'none' ? '' : `, ${taskPriorityLabels[task.priority]} priority`;
    const tier = task.tier === 'background' ? ', background' : '';
    return `Open task #${task.number} ${task.title}, ${assigneeLabel}${priority}${tier}`;
}

/**
 * What a widened lens is showing that the resting one was not. It is a plain
 * word rather than a chip: a background task is an ordinary task seen from a
 * lens the reader opened, not a task with a special status.
 */
function TaskBackgroundLabel({ tier }: { tier: TaskItem['tier'] }) {
    if (tier !== 'background') {
        return null;
    }

    return <span className="shrink-0 font-normal text-muted text-xs">background</span>;
}

// The task's own open affordance. Board cards and list rows both carry inline
// controls, so opening stays on an explicit button rather than a row action.
/**
 * The board card's read-only face. Priority and assignee are deliberately absent:
 * the editable controls below the summary already carry them, and printing them
 * twice made the card read like a debug dump.
 */
function TaskSummary({ onOpen, task }: { onOpen: (task: TaskItem) => void; task: TaskItem }) {
    return (
        <button
            aria-label={`Open task #${task.number} ${task.title}`}
            className="block w-full min-w-0 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => onOpen(task)}
            type="button"
        >
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-muted text-xs">
                <span className="truncate">
                    #{task.number} · {task.chatLabel}
                </span>
                <TaskBackgroundLabel tier={task.tier} />
            </span>
            <span className="mt-1 block font-medium text-foreground text-sm">{task.title}</span>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {task.labels.map((label) => (
                    <LabelChip color={label.color} key={label.id} name={label.name} />
                ))}
                <span className="text-muted text-xs">
                    <RelativeTime value={task.updatedAt} />
                </span>
            </div>
        </button>
    );
}

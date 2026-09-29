import type { Agent, Chat, ChatMessage, TaskLabel, TaskListItem } from '@haus/api';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import {
    type TaskOrigin,
    type TaskPriority,
    type TaskStatus,
    type TaskTier,
    taskStatusLabels,
} from '../../tasks/task-presentation.ts';
import type { HumanDirectory } from '../human-identity.ts';
import { selectStalledClaims } from './stalled-claims.ts';

export type TaskView = 'all' | 'active' | 'unassigned';

export interface TaskItem {
    assigneeAgentId: string | null;
    assigneeAvatarUrl: string | null;
    assigneeLabel: string;
    chatId: string;
    chatLabel: string;
    claimedAt: string | null;
    createdAt: string;
    createdByUserId: string | null;
    id: string;
    labels: TaskLabel[];
    /** The assignee Agent is running a turn on this task right now. */
    live: boolean;
    message: ChatMessage;
    number: number;
    /** Who made the task: a human composed or converted it, or an Agent claimed it. */
    origin: TaskOrigin;
    priority: TaskPriority;
    status: TaskStatus;
    threadChatId: string;
    threadSummary: TaskListItem['threadSummary'];
    /** Which lens this task belongs to; `background` shows only when widened. */
    tier: TaskTier;
    /** The canonical message as one line; the Thread renders the message itself. */
    title: string;
    updatedAt: string;
    version: number;
}

export const taskStatuses: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done', 'closed'];

/**
 * `active` is the resting view: finished work is history, and a page that
 * opens on every task Haus has ever closed buries the ones still moving.
 * `all` is a deliberate widening, so it is the value that rides the URL.
 */
export function resolveTaskView(value: string | null): TaskView {
    return value === 'all' || value === 'unassigned' ? value : 'active';
}

export function taskChatOptions(chats: Chat[], humans: HumanDirectory) {
    return chats
        .filter((chat) => !chat.peerAgentRetired)
        .map((chat) => ({
            id: chat.id,
            label:
                chat.kind === 'channel'
                    ? `#${chat.name}`
                    : `DM · ${chat.peerAgentDisplayName ?? humans.name(chat.peerUserId)}`,
        }));
}

/** Tasks are Agent work (ADR 0037): the assignee is an Agent or nobody. */
export function taskAssigneeName(task: Pick<TaskItem, 'assigneeAgentId'>, agents: Agent[]) {
    if (task.assigneeAgentId) {
        const agent = agents.find((candidate) => candidate.id === task.assigneeAgentId);
        return agent?.displayName ?? `Agent ${task.assigneeAgentId.slice(-6)}`;
    }
    return 'Unassigned';
}

export function taskAssigneeAvatarUrl(task: Pick<TaskItem, 'assigneeAgentId'>, agents: Agent[]) {
    if (!task.assigneeAgentId) {
        return null;
    }
    return agents.find((candidate) => candidate.id === task.assigneeAgentId)?.avatarUrl ?? null;
}

export function toTaskItem(
    item: TaskListItem,
    humans: HumanDirectory,
    agents: Agent[] = []
): TaskItem {
    return {
        assigneeAgentId: item.task.assigneeAgentId,
        assigneeAvatarUrl: taskAssigneeAvatarUrl(item.task, agents),
        assigneeLabel: taskAssigneeName(item.task, agents),
        chatId: item.task.chatId,
        chatLabel: taskChatLabel(item, humans),
        claimedAt: item.task.claimedAt,
        createdAt: item.task.createdAt,
        createdByUserId: item.task.createdByUserId,
        id: item.message.id,
        labels: item.task.labels,
        live: item.task.live,
        message: item.message,
        number: item.task.number,
        origin: item.task.origin,
        priority: item.task.priority,
        status: item.task.status,
        threadChatId: item.task.threadChatId,
        threadSummary: item.threadSummary,
        tier: item.task.tier,
        title: messagePreviewLine(item.message.content),
        updatedAt: item.task.updatedAt,
        version: item.task.version,
    };
}

/**
 * Where the task lives. An Agent DM has no human peer to name, so it reads as
 * `DM` rather than claiming a peer that is not there.
 */
function taskChatLabel(item: TaskListItem, humans: HumanDirectory): string {
    if (item.chatKind === 'channel') {
        return `#${item.chatName ?? 'channel'}`;
    }
    return item.chatPeerUserId ? `DM · ${humans.name(item.chatPeerUserId)}` : 'DM';
}

export interface TaskFilterInput {
    /** An Agent id, or the literal `unassigned`. */
    assignee?: null | string;
    labelId?: null | string;
    priority?: null | string;
    status?: null | string;
    view: TaskView;
}

export function filterTasks(tasks: TaskItem[], input: TaskFilterInput) {
    return tasks.filter((task) => {
        // `active` is a standing guess about which statuses matter; an
        // explicit Status is the reader answering that same question
        // outright, so it wins. Without this, asking for Done on the resting
        // view returns nothing and the page never says why.
        if (
            input.view === 'active' &&
            !input.status &&
            (task.status === 'done' || task.status === 'closed')
        ) {
            return false;
        }
        if (input.view === 'unassigned' && task.assigneeAgentId !== null) {
            return false;
        }
        if (input.labelId && !task.labels.some((label) => label.id === input.labelId)) {
            return false;
        }
        if (input.status && task.status !== input.status) {
            return false;
        }
        if (input.priority && task.priority !== input.priority) {
            return false;
        }
        if (input.assignee && !matchesAssignee(task, input.assignee)) {
            return false;
        }
        return true;
    });
}

/** `unassigned` is its own bucket; anything else is an Agent id. */
function matchesAssignee(task: TaskItem, assignee: string) {
    if (assignee === unassignedAssignee) {
        return task.assigneeAgentId === null;
    }
    return task.assigneeAgentId === assignee;
}

export const unassignedAssignee = 'unassigned';

// Linear-style ordering inside a status group: most urgent first, unset last.
// Board columns and list groups both ride this so the lenses agree.
const priorityRank: Record<TaskPriority, number> = {
    high: 1,
    low: 3,
    medium: 2,
    none: 4,
    urgent: 0,
};

/** Board columns read as a pipeline, so they keep lifecycle order. */
export function groupTasks(tasks: TaskItem[]) {
    return groupTasksBy(tasks, taskStatuses);
}

/**
 * The List's groups. `in_review` leads and says so in words: a task waiting on
 * a person is the only kind the reader can finish by looking at it, so the
 * review queue is what the page opens on. Claims an Agent stopped short of
 * finishing follow it as their own group, out of `in_progress`, because no
 * run is coming back for them — the reader decides what happens next.
 */
export function groupTasksForList(tasks: TaskItem[]): TaskListSection[] {
    const stalled = new Set(selectStalledClaims(tasks));
    const [review, ...rest] = groupTasksBy(
        tasks.filter((task) => !stalled.has(task)),
        taskListStatuses
    ).map((group) => ({
        ...group,
        key: group.status,
        title: taskListGroupTitles[group.status] ?? taskStatusLabels[group.status],
    }));
    const stopped: TaskListSection = {
        key: 'stopped',
        status: 'in_progress',
        tasks: groupTasksBy([...stalled], ['in_progress'])[0]?.tasks ?? [],
        title: 'Stopped before finishing',
    };

    return review ? [review, stopped, ...rest] : [stopped, ...rest];
}

export interface TaskListSection {
    /** Stable across renders; the stopped group shares `in_progress`'s status. */
    key: 'stopped' | TaskStatus;
    status: TaskStatus;
    tasks: TaskItem[];
    title: string;
}

const taskListStatuses: TaskStatus[] = ['in_review', 'todo', 'in_progress', 'done', 'closed'];

const taskListGroupTitles: Partial<Record<TaskStatus, string>> = {
    in_review: 'Needs your review',
};

function groupTasksBy(tasks: TaskItem[], statuses: TaskStatus[]) {
    return statuses.map((status) => ({
        status,
        tasks: tasks
            .filter((task) => task.status === status)
            .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]),
    }));
}

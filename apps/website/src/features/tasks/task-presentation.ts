export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'closed';
export type TaskPriority = 'none' | 'urgent' | 'high' | 'medium' | 'low';

/**
 * How the task row came to exist: a human composed a message as a task or
 * converted an existing one, or an Agent claimed the message before working
 * on it. Chat reads this to tell a person's task from an Agent's bookkeeping.
 */
export type TaskOrigin = 'claimed' | 'composed' | 'converted';

/**
 * Which lens a task belongs to. `background` is an Agent's own claim on work
 * it finished inside one turn — a lock and a record, kept off the Board and
 * the List. Everything else is `tracked`.
 */
export type TaskTier = 'background' | 'tracked';

export const taskStatusOrder: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done', 'closed'];

export const taskStatusLabels: Record<TaskStatus, string> = {
    closed: 'Closed',
    done: 'Done',
    in_progress: 'In progress',
    in_review: 'In review',
    todo: 'Todo',
};

// Status-colored chip fills for the transcript task chip and status pills:
// the Raft chip palette rides the shared label tokens.
export const taskStatusClasses: Record<TaskStatus, string> = {
    closed: 'bg-[var(--label-gray-bg)] text-[var(--label-gray-fg)]',
    done: 'bg-[var(--label-green-bg)] text-[var(--label-green-fg)]',
    in_progress: 'bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]',
    in_review: 'bg-[var(--label-purple-bg)] text-[var(--label-purple-fg)]',
    todo: 'bg-[var(--label-orange-bg)] text-[var(--label-orange-fg)]',
};

// Status hue for the TaskStatusDisc on neutral surfaces (board headers,
// list groups) where there is no chip fill to carry the color.
export const taskStatusDiscClasses: Record<TaskStatus, string> = {
    closed: 'text-[var(--label-gray-fg)]',
    done: 'text-[var(--label-green-fg)]',
    in_progress: 'text-[var(--label-blue-fg)]',
    in_review: 'text-[var(--label-purple-fg)]',
    todo: 'text-[var(--label-orange-fg)]',
};

export const taskPriorityOrder: TaskPriority[] = ['none', 'urgent', 'high', 'medium', 'low'];

export const taskPriorityLabels: Record<TaskPriority, string> = {
    high: 'High',
    low: 'Low',
    medium: 'Medium',
    none: 'No priority',
    urgent: 'Urgent',
};

export function formatTaskNumber(task: { number: number }) {
    return `#${task.number}`;
}

/**
 * A task as the transcript reads it: the identity the header mark renders and
 * the Tasks views index by. The lifecycle-rich record lives on the Server.
 */
export interface MessageTask {
    assignee: {
        handle: string | null;
        id: string;
        kind?: 'agent';
    } | null;
    /** The assignee Agent is running a turn on this task right now. */
    live: boolean;
    number: number;
    status: TaskStatus;
    tier: TaskTier;
}

/**
 * The assignee as a label, without guessing. A handle-less Agent has no honest
 * short name here, so the caller falls back to a resolved profile or shows
 * nothing rather than printing an opaque id.
 */
export function messageTaskAssigneeLabel(task: MessageTask) {
    return task.assignee?.handle ? `@${task.assignee.handle}` : null;
}

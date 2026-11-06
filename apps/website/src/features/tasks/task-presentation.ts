import type { TaskMessagePlace } from '@haus/api';

export type TaskPriority = 'none' | 'urgent' | 'high' | 'medium' | 'low';

export const taskPriorityOrder: TaskPriority[] = ['none', 'urgent', 'high', 'medium', 'low'];

export const taskPriorityLabels: Record<TaskPriority, string> = {
    high: 'High',
    low: 'Low',
    medium: 'Medium',
    none: 'No priority',
    urgent: 'Urgent',
};

/** Most urgent first, unset last: the order an Agent picks its next Task in. */
export const taskPriorityRank: Record<TaskPriority, number> = {
    high: 1,
    low: 3,
    medium: 2,
    none: 4,
    urgent: 0,
};

/** `#security`, `#security · Thread`, `DM`, or `DM · Thread`: a DM never names its peer here. */
export function taskMessagePlaceLabel({
    chatKind,
    chatName,
    threadAnchorMessageId,
}: TaskMessagePlace) {
    const name = chatKind === 'channel' ? `#${chatName}` : 'DM';
    return threadAnchorMessageId ? `${name} · Thread` : name;
}

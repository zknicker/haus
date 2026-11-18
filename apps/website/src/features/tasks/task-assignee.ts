import type { TaskAssignee, TaskListAssigneeFilter } from '@haus/api';

/** The one spelling of "nobody" a filter or picker uses. */
export const unassignedKey = 'none';

export function assigneeKey(assignee: TaskAssignee | null): string {
    if (!assignee) {
        return unassignedKey;
    }
    return assignee.kind === 'agent' ? `agent:${assignee.agentId}` : `user:${assignee.userId}`;
}

export function assigneeFromKey(key: string): TaskAssignee | null {
    const [kind, id] = key.split(':');
    if (kind === 'agent' && id) {
        return { agentId: id, kind };
    }
    return kind === 'user' && id ? { kind, userId: id } : null;
}

/** An `assigneeKey` as the `task.list` filter it narrows to. */
export function assigneeFilterFromKey(key: string): TaskListAssigneeFilter {
    const assignee = assigneeFromKey(key);
    if (!assignee) {
        return 'none';
    }
    return assignee.kind === 'agent' ? { agentId: assignee.agentId } : { userId: assignee.userId };
}

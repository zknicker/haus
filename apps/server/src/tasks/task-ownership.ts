import type { MessageTask } from '@haus/api';

type TaskOwnership = Pick<MessageTask, 'assigneeAgentId' | 'assigneeUserId'>;

export function taskHasOtherOwnerForUser(task: TaskOwnership, userId: string) {
    return Boolean(task.assigneeAgentId || (task.assigneeUserId && task.assigneeUserId !== userId));
}

export function taskHasOtherOwnerForAgent(task: TaskOwnership, agentId: string) {
    return Boolean(
        task.assigneeUserId || (task.assigneeAgentId && task.assigneeAgentId !== agentId)
    );
}

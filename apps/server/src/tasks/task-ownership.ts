import type { MessageTask } from '@haus/api';

type TaskOwnership = Pick<MessageTask, 'assigneeAgentId'>;

export function taskHasOtherOwnerForAgent(task: TaskOwnership, agentId: string) {
    return Boolean(task.assigneeAgentId && task.assigneeAgentId !== agentId);
}

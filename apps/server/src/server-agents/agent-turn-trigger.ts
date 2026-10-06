import type { AgentTurnTrigger } from '@haus/api';

const taskAssignmentKeyPattern = /^task-assign:([^:]+):\d+$/u;

/**
 * Names a turn's recorded trigger in the narrow API shape. A trigger in a Chat the
 * reader cannot see is `private`; one with no record, or a source this Server
 * does not recognize, is absent (null) rather than guessed.
 */
export function agentTurnTrigger(
    record: { chatId: string; source: string; visible: boolean; workId: string } | null
): AgentTurnTrigger | null {
    if (!record) {
        return null;
    }
    const trigger = triggerFor(record);
    if (!trigger) {
        return null;
    }
    return record.visible ? trigger : { kind: 'private' };
}

function triggerFor({
    chatId,
    source,
    workId,
}: {
    chatId: string;
    source: string;
    workId: string;
}): AgentTurnTrigger | null {
    if (source === 'human') {
        return { author: 'human', chatId, kind: 'message', messageId: workId };
    }
    if (source.startsWith('agent:')) {
        return { author: 'agent', chatId, kind: 'message', messageId: workId };
    }
    switch (source) {
        case 'task_assignment': {
            const messageId = taskAssignmentKeyPattern.exec(workId)?.[1];
            return messageId ? { chatId, kind: 'task', messageId } : null;
        }
        case 'reminder':
            return { chatId, kind: 'reminder' };
        case 'trigger':
            return { chatId, kind: 'trigger' };
        case 'cloud_agent_work':
            return { chatId, kind: 'cloud_agent' };
        case 'onboarding':
            return { chatId, kind: 'onboarding' };
        default:
            return null;
    }
}

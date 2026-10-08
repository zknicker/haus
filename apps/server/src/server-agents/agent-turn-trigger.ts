import type { AgentTurnTrigger, AgentTurnTriggerPreview } from '@haus/api';

const taskAssignmentKeyPattern = /^task-assign:([^:]+):\d+$/u;

/** A run's recorded trigger row, with whether the reader can see its Chat. */
export interface AgentTurnTriggerRecord {
    readonly chatId: string;
    readonly source: string;
    readonly visible: boolean;
    readonly workId: string;
}

/** Message quotes by message id; a message absent here reads as gone (`preview: null`). */
export type AgentTurnTriggerPreviews = ReadonlyMap<string, AgentTurnTriggerPreview>;

const noPreviews: AgentTurnTriggerPreviews = new Map();

/**
 * Names a turn's recorded trigger in the narrow API shape. A trigger in a Chat the
 * reader cannot see is `private`; one with no record, or a source this Server
 * does not recognize, is absent (null) rather than guessed. A message or task
 * trigger quotes its message from `previews`.
 */
export function agentTurnTrigger(
    record: AgentTurnTriggerRecord | null,
    previews: AgentTurnTriggerPreviews = noPreviews
): AgentTurnTrigger | null {
    if (!record) {
        return null;
    }
    const trigger = triggerFor(record, previews);
    if (!trigger) {
        return null;
    }
    return record.visible ? trigger : { kind: 'private' };
}

/** The message a visible message or task trigger quotes, if any. */
export function agentTurnTriggerMessageRef(
    record: AgentTurnTriggerRecord | null
): { chatId: string; messageId: string } | null {
    if (!record?.visible) {
        return null;
    }
    const trigger = triggerFor(record, noPreviews);
    return trigger && (trigger.kind === 'message' || trigger.kind === 'task')
        ? { chatId: trigger.chatId, messageId: trigger.messageId }
        : null;
}

function triggerFor(
    { chatId, source, workId }: AgentTurnTriggerRecord,
    previews: AgentTurnTriggerPreviews
): AgentTurnTrigger | null {
    if (source === 'human' || source.startsWith('agent:')) {
        return {
            author: source === 'human' ? 'human' : 'agent',
            chatId,
            kind: 'message',
            messageId: workId,
            preview: previews.get(workId) ?? null,
        };
    }
    switch (source) {
        case 'task_assignment': {
            const messageId = taskAssignmentKeyPattern.exec(workId)?.[1];
            return messageId
                ? { chatId, kind: 'task', messageId, preview: previews.get(messageId) ?? null }
                : null;
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

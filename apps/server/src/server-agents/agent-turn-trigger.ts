import {
    AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH,
    type AgentTurnTrigger,
    type AgentTurnTriggerPreview,
    isBatchedChatlessInboxSource,
} from '@haus/api';

const claimAssignmentKeyPattern = /^claim-assign:([^:]+):\d+$/u;

/** A run's recorded trigger row, with whether the reader can see its Chat. */
export interface AgentTurnTriggerRecord {
    /** The run's Agent, which narrows a read of its settled inbox rows to that Agent's index. */
    readonly agentId?: string;
    /** Null only for a chatless run: a sub-agent wake, Drive conflict, process exit, or Issue item. */
    readonly chatId: string | null;
    /** The run this trigger woke. */
    readonly runId?: string;
    readonly source: string;
    readonly visible: boolean;
    readonly workId: string;
}

/** Message quotes by message id; a message absent here reads as gone (`preview: null`). */
export type AgentTurnTriggerPreviews = ReadonlyMap<string, AgentTurnTriggerPreview>;

/** Issue item triggers by `workId`, read beside the page; one absent here is unknown. */
export type AgentTurnIssueTriggers = ReadonlyMap<
    string,
    Extract<AgentTurnTrigger, { kind: 'issue' }>
>;

const noPreviews: AgentTurnTriggerPreviews = new Map();

/**
 * Names a turn's recorded trigger in the narrow API shape. A trigger in a Chat the
 * reader cannot see is `private`; one with no record, or a source this Server
 * does not recognize, is absent (null) rather than guessed. A message or claim
 * trigger quotes its message from `previews`. A sub-agent wake has no Chat to gate
 * on: it names only itself, so any reader who may see the Agent's turns sees it. A
 * Issue item has no Chat either, and every member reads every Issue, so `issues`
 * names it ungated.
 */
export function agentTurnTrigger(
    record: AgentTurnTriggerRecord | null,
    previews: AgentTurnTriggerPreviews = noPreviews,
    issues: AgentTurnIssueTriggers = new Map()
): AgentTurnTrigger | null {
    if (!record) {
        return null;
    }
    if (record.source === 'subagent') {
        return { kind: 'subagent' };
    }
    if (record.source === 'crew_report') {
        return { kind: 'private' };
    }
    if (isBatchedChatlessInboxSource(record.source)) {
        return issues.get(record.workId) ?? null;
    }
    const trigger = triggerFor(record, previews);
    if (!trigger) {
        return null;
    }
    return record.visible ? trigger : { kind: 'private' };
}

/** The message a visible message or claim trigger quotes, if any. */
export function agentTurnTriggerMessageRef(
    record: AgentTurnTriggerRecord | null
): { chatId: string; messageId: string } | null {
    if (!record?.visible) {
        return null;
    }
    const trigger = triggerFor(record, noPreviews);
    return trigger && (trigger.kind === 'message' || trigger.kind === 'claim')
        ? { chatId: trigger.chatId, messageId: trigger.messageId }
        : null;
}

function triggerFor(
    { chatId, source, workId }: AgentTurnTriggerRecord,
    previews: AgentTurnTriggerPreviews
): AgentTurnTrigger | null {
    if (chatId === null) {
        return null;
    }
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
        case 'claim_assignment': {
            const messageId = claimAssignmentKeyPattern.exec(workId)?.[1];
            return messageId
                ? { chatId, kind: 'claim', messageId, preview: previews.get(messageId) ?? null }
                : null;
        }
        case 'reminder':
            return { chatId, kind: 'reminder' };
        case 'trigger':
            return { chatId, kind: 'trigger' };
        case 'pull_request':
            return { chatId, kind: 'pull_request' };
        case 'onboarding':
            return { chatId, kind: 'onboarding' };
        case 'greeting':
            return { chatId, kind: 'greeting' };
        default:
            return null;
    }
}

const highSurrogateAtEnd = /[\uD800-\uDBFF]$/u;

/**
 * The contract bounds UTF-16 units while Postgres `left` counts characters, so
 * the head is cut again here without splitting a surrogate pair.
 */
export function previewHead(content: string): string {
    if (content.length <= AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH) {
        return content;
    }
    const head = content.slice(0, AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH);
    return highSurrogateAtEnd.test(head) ? head.slice(0, -1) : head;
}

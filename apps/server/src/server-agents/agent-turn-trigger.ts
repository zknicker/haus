import type { AgentTurnTrigger, AgentTurnTriggerPreview } from '@haus/api';
import {
    heartbeatReportDedupeKey,
    heartbeatRunIdOfReport,
} from '../agent-delivery/heartbeat-keys.ts';

const taskAssignmentKeyPattern = /^task-assign:([^:]+):\d+$/u;

/** A run's recorded trigger row, with whether the reader can see its Chat. */
export interface AgentTurnTriggerRecord {
    /** Null only for a chatless run: a dream, heartbeat, or heartbeat report. */
    readonly chatId: string | null;
    /** The run this trigger woke; a heartbeat needs it to find its report. */
    readonly runId?: string;
    readonly source: string;
    readonly visible: boolean;
    readonly workId: string;
}

/** Message quotes by message id; a message absent here reads as gone (`preview: null`). */
export type AgentTurnTriggerPreviews = ReadonlyMap<string, AgentTurnTriggerPreview>;

const noPreviews: AgentTurnTriggerPreviews = new Map();
const noReports: ReadonlySet<string> = new Set();

/** The inbox dedupe key a daytime heartbeat's report would carry, or null without a run id. */
export function agentTurnTriggerReportKey(record: AgentTurnTriggerRecord | null): string | null {
    return record?.source === 'heartbeat' && record.runId
        ? heartbeatReportDedupeKey(record.runId)
        : null;
}

/**
 * Names a turn's recorded trigger in the narrow API shape. A trigger in a Chat the
 * reader cannot see is `private`; one with no record, or a source this Server
 * does not recognize, is absent (null) rather than guessed. A message or task
 * trigger quotes its message from `previews`. A dream has no Chat to gate on: it
 * names only itself, so any reader who may see the Agent's turns sees it. A heartbeat
 * is `reported` when its report key is in `reportedKeys`.
 */
export function agentTurnTrigger(
    record: AgentTurnTriggerRecord | null,
    previews: AgentTurnTriggerPreviews = noPreviews,
    reportedKeys: ReadonlySet<string> = noReports
): AgentTurnTrigger | null {
    if (!record) {
        return null;
    }
    if (record.source === 'dream') {
        return { kind: 'dream' };
    }
    if (record.source === 'heartbeat') {
        const key = agentTurnTriggerReportKey(record);
        return { kind: 'heartbeat', reported: key !== null && reportedKeys.has(key) };
    }
    if (record.source === 'heartbeat_report') {
        // A report with no recoverable heartbeat run is unknown, not guessed.
        return isReportKey(record.workId)
            ? { heartbeatRunId: heartbeatRunIdOfReport(record.workId), kind: 'heartbeat_report' }
            : null;
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

function isReportKey(workId: string): boolean {
    const prefix = heartbeatReportDedupeKey('');
    return workId.startsWith(prefix) && workId.length > prefix.length;
}

import {
    type DispatchKey,
    type InvocationOperation,
    type InvocationResultFrame,
    type InvokeResult,
    invocationOutcomeNotices,
    invocationTimeoutsMs,
} from '@haus/api';
import type { InvocationRecord } from './invocation-store.ts';

type AnswerKey = DispatchKey & { agentId: string };

export function clampTimeoutMs(operation: InvocationOperation, requestedMs: number | undefined) {
    const limits = invocationTimeoutsMs[operation.kind];
    return Math.min(requestedMs ?? limits.default, limits.max);
}

export function noticeAnswer(
    key: AnswerKey,
    outcome: 'offline' | 'unknown',
    invocationId?: string
) {
    const answer: InvocationResultFrame = {
        agentId: key.agentId,
        ...(invocationId ? { invocationId } : {}),
        outcome,
        output: { kind: 'text', text: invocationOutcomeNotices[outcome] },
        runId: key.runId,
        seq: key.seq,
        toolCallId: key.toolCallId,
        truncated: false,
        type: 'invocation-result',
    };
    return answer;
}

export function resultAnswer(record: InvocationRecord, result: InvokeResult) {
    if (result.outcome === 'unknown') {
        return noticeAnswer(keyOf(record), 'unknown', record.id);
    }
    const answer: InvocationResultFrame = {
        ...keyOf(record),
        ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
        invocationId: record.id,
        ...(result.logPath ? { logPath: result.logPath } : {}),
        outcome: result.outcome,
        output: result.output,
        truncated: result.truncated,
        type: 'invocation-result',
    };
    return answer;
}

export function settledAnswer(record: InvocationRecord) {
    const outcome = record.outcome;
    if (outcome === null || outcome === 'offline' || outcome === 'unknown') {
        return noticeAnswer(keyOf(record), outcome ?? 'unknown', record.id);
    }
    const answer: InvocationResultFrame = {
        ...keyOf(record),
        ...(record.exitCode === null ? {} : { exitCode: record.exitCode }),
        invocationId: record.id,
        outcome,
        output: { kind: 'text', text: 'This call already finished; its output was answered once.' },
        truncated: false,
        type: 'invocation-result',
    };
    return answer;
}

function keyOf(record: InvocationRecord) {
    return {
        agentId: record.agentId,
        runId: record.runId,
        seq: record.seq,
        toolCallId: record.toolCallId,
    };
}

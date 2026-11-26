import {
    type DispatchKey,
    type InvocationOperation,
    type InvocationOutcome,
    type InvocationRequestFrame,
    type InvocationResultFrame,
    type InvokeCancelCommand,
    type InvokeCommand,
    type InvokeResult,
    invocationGraceMs,
    invocationOutcomeNotices,
    invocationTimeoutsMs,
} from '@haus/api';
import type { InvocationRecord } from './invocation-store.ts';

type AnswerKey = DispatchKey & { agentId: string };

export function clampTimeoutMs(operation: InvocationOperation, requestedMs: number | undefined) {
    const limits = invocationTimeoutsMs[operation.kind];
    return Math.min(requestedMs ?? limits.default, limits.max);
}

export function invokeCommand(
    frame: Pick<InvocationRequestFrame, 'agentId' | 'runId'>,
    input: {
        invocationId: string;
        operation: InvocationOperation;
        requestedAt: Date;
        timeoutMs: number;
    }
) {
    const command: InvokeCommand = {
        agentId: frame.agentId,
        invocationId: input.invocationId,
        notAfter: new Date(
            input.requestedAt.getTime() + input.timeoutMs + invocationGraceMs
        ).toISOString(),
        operation: input.operation,
        runId: frame.runId,
        timeoutMs: input.timeoutMs,
        type: 'invoke',
    };
    return command;
}

export function dropUnstartedCancel(invocationId: string) {
    const cancel: InvokeCancelCommand = {
        dropIfNotStarted: true,
        invocationId,
        type: 'invoke-cancel',
    };
    return cancel;
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

export function textAnswer(record: InvocationRecord, outcome: InvocationOutcome, text: string) {
    const answer: InvocationResultFrame = {
        ...keyOf(record),
        ...(record.exitCode === null ? {} : { exitCode: record.exitCode }),
        invocationId: record.id,
        outcome,
        output: { kind: 'text', text },
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

export function withLeadLine(answer: InvocationResultFrame, line: string) {
    if (answer.output.kind !== 'text') {
        return answer;
    }
    const { text } = answer.output;
    const named: InvocationResultFrame = {
        ...answer,
        output: { kind: 'text', text: text ? `${line}\n${text}` : line },
    };
    return named;
}

export function keyOf(record: InvocationRecord) {
    return {
        agentId: record.agentId,
        runId: record.runId,
        seq: record.seq,
        toolCallId: record.toolCallId,
    };
}

import { runnerUnsentWrite } from '@haus/agent-prompt';
import {
    type DispatchKey,
    dispatchIdOf,
    type InvocationOperation,
    type InvocationOutcome,
    type InvocationOutput,
    type InvocationResultFrame,
    invocationGraceMs,
    invocationOutcomeNotices,
    invocationRunnerMarginMs,
    invocationTimeoutsMs,
} from '@haus/api';
import type { RunDispatches } from '../dispatch/dispatch-id.ts';
import type { RunAuthority, RunnerLink, ToolOutcome, ToolResultContent } from '../run-context.ts';
import type { InvocationClock } from './invocation-clock.ts';
import { fileWriteBytes, inlineInvocationPayload } from './invocation-payload.ts';

export type InvocationClient = ReturnType<typeof createInvocationClient>;

export interface InvocationAnswer {
    readonly frame: InvocationResultFrame;
    readonly timeoutNote: string | null;
    readonly timeoutMs: number;
}

export interface InvokeOptions {
    readonly computer?: string;
    readonly requestedTimeoutMs?: number;
    readonly signal: AbortSignal;
}

interface OpenInvocation {
    answered: boolean;
    readonly key: DispatchKey;
    readonly reading: AbortController;
    settle(frame: InvocationResultFrame): void;
}

export function createInvocationClient(input: {
    agentId: string;
    authority: RunAuthority;
    clock: InvocationClock;
    dispatches: RunDispatches;
    link: RunnerLink;
}) {
    const open = new Map<string, OpenInvocation>();
    const halt = (pending: OpenInvocation) => {
        if (!pending.answered) {
            input.link.send({ ...pending.key, agentId: input.agentId, type: 'invocation-cancel' });
        }
        pending.reading.abort();
    };
    const unknown = (key: DispatchKey) => {
        const frame: InvocationResultFrame = {
            ...key,
            agentId: input.agentId,
            outcome: 'unknown',
            output: { kind: 'text', text: invocationOutcomeNotices.unknown },
            truncated: false,
            type: 'invocation-result',
        };
        return frame;
    };
    const dispatch = async (
        toolCallId: string,
        kind: InvocationOperation['kind'],
        prepare: (key: DispatchKey, signal: AbortSignal) => Promise<InvocationOperation>,
        options: InvokeOptions
    ) => {
        const { timeoutMs, timeoutNote } = clampTimeout(kind, options.requestedTimeoutMs);
        options.signal.throwIfAborted();
        const key = await input.dispatches.open(toolCallId, 'invocation');
        const prepared = await prepareOperation(key, prepare, options.signal, timeoutMs);
        if (prepared.kind === 'unsent') {
            const frame: InvocationResultFrame = {
                ...key,
                agentId: input.agentId,
                outcome: prepared.outcome,
                output: { kind: 'text', text: prepared.text },
                truncated: false,
                type: 'invocation-result',
            };
            await input.dispatches.finish(key, frame.outcome);
            return { frame, timeoutMs, timeoutNote } satisfies InvocationAnswer;
        }
        const { operation } = prepared;
        const id = dispatchIdOf(key);
        const onAbort = () => {
            const pending = open.get(id);
            if (pending) {
                halt(pending);
            }
        };
        const frame = await new Promise<InvocationResultFrame>((resolve) => {
            const pending: OpenInvocation = {
                answered: false,
                key,
                reading: new AbortController(),
                settle: (answer) => {
                    pending.answered = true;
                    void inlineInvocationPayload(
                        input.authority,
                        answer,
                        pending.reading.signal
                    ).then((read) => {
                        deadline.cancel();
                        open.delete(id);
                        resolve(read);
                    });
                },
            };
            const deadline = input.clock.schedule(
                () => {
                    pending.reading.abort();
                    if (!pending.answered) {
                        open.delete(id);
                        resolve(unknown(key));
                    }
                },
                timeoutMs + invocationGraceMs + invocationRunnerMarginMs
            );
            open.set(id, pending);
            options.signal.addEventListener('abort', onAbort, { once: true });
            input.link.send({
                ...key,
                agentId: input.agentId,
                ...(options.computer === undefined ? {} : { computer: options.computer }),
                operation,
                timeoutMs,
                type: 'invocation-request',
            });
        });
        options.signal.removeEventListener('abort', onAbort);
        await input.dispatches.finish(key, frame.outcome);
        return { frame, timeoutMs, timeoutNote } satisfies InvocationAnswer;
    };
    return {
        invoke(toolCallId: string, operation: InvocationOperation, options: InvokeOptions) {
            return dispatch(toolCallId, operation.kind, async () => operation, options);
        },
        writeFile(
            toolCallId: string,
            file: { bytes: Uint8Array; mode: number; path: string },
            options: { computer?: string; signal: AbortSignal }
        ) {
            return dispatch(
                toolCallId,
                'file-write',
                async (key, signal) => ({
                    bytes: await fileWriteBytes(input.authority, key, file.bytes, signal),
                    kind: 'file-write',
                    mode: file.mode,
                    path: file.path,
                }),
                options
            );
        },
        receive(frame: InvocationResultFrame) {
            const pending = open.get(dispatchIdOf(frame));
            if (!pending || pending.answered) {
                return false;
            }
            pending.settle(frame);
            return true;
        },
        cancelOpen() {
            for (const pending of open.values()) {
                halt(pending);
            }
        },
    };
}

export function invocationToolOutcome(answer: InvocationAnswer) {
    const { frame } = answer;
    const image = imageOf(frame.output);
    const text = invocationText(answer);
    const textPart: ToolResultContent = { text, type: 'text' };
    return {
        content: image ? [image, ...(text.length > 0 ? [textPart] : [])] : [textPart],
        invocation: frame.outcome,
        isError: !(frame.outcome === 'completed' && (frame.exitCode ?? 0) === 0),
    } satisfies ToolOutcome;
}

export function invocationText(answer: InvocationAnswer) {
    const { frame } = answer;
    const output = imageOf(frame.output) ? '' : invocationOutputText(frame.output);
    return [
        ...outcomeLines(frame.outcome, output, frame.exitCode, answer.timeoutMs),
        ...(frame.logPath ? [`Full output: ${frame.logPath}`] : []),
        ...(answer.timeoutNote ? [answer.timeoutNote] : []),
    ].join('\n');
}

export function invocationOutputText(output: InvocationOutput) {
    switch (output.kind) {
        case 'text':
            return output.text;
        case 'inline':
            return `The machine returned ${Buffer.from(output.base64, 'base64').byteLength} bytes of ${output.mediaType}.`;
        case 'attachment':
            return `The result arrived as attachment ${output.attachmentId} (${output.mediaType}, ${output.sizeBytes} bytes).`;
        default:
            return output satisfies never;
    }
}

function outcomeLines(
    outcome: InvocationOutcome,
    output: string,
    exitCode: number | undefined,
    timeoutMs: number
) {
    const body = output.length > 0 ? [output] : [];
    switch (outcome) {
        case 'completed':
            return (exitCode ?? 0) === 0 ? body : [...body, `Exit code: ${exitCode}`];
        case 'failed':
            return body.length > 0 ? body : ['The machine refused the operation.'];
        case 'timed-out':
            return [
                ...body,
                `Timed out after ${timeoutMs / 1000} s; the process group was killed.`,
            ];
        case 'cancelled':
            return [...body, 'Cancelled before it finished.'];
        case 'offline':
            return body.length > 0 ? body : [invocationOutcomeNotices.offline];
        case 'unknown':
            return [invocationOutcomeNotices.unknown];
        default:
            return outcome satisfies never;
    }
}

async function prepareOperation(
    key: DispatchKey,
    prepare: (key: DispatchKey, signal: AbortSignal) => Promise<InvocationOperation>,
    signal: AbortSignal,
    timeoutMs: number
) {
    try {
        const operation = await prepare(
            key,
            AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        );
        return { kind: 'ready' as const, operation };
    } catch (error) {
        if (signal.aborted) {
            return {
                kind: 'unsent' as const,
                outcome: 'cancelled' as const,
                text: runnerUnsentWrite.cancelled,
            };
        }
        const reason = error instanceof Error ? error.message : String(error);
        return {
            kind: 'unsent' as const,
            outcome: 'failed' as const,
            text: runnerUnsentWrite.failed(reason),
        };
    }
}

function clampTimeout(kind: InvocationOperation['kind'], requestedMs: number | undefined) {
    const limits = invocationTimeoutsMs[kind];
    if (requestedMs === undefined) {
        return { timeoutMs: limits.default, timeoutNote: null };
    }
    if (requestedMs > limits.max) {
        return {
            timeoutMs: limits.max,
            timeoutNote: `The timeout was clamped to the ${limits.max / 1000} s maximum.`,
        };
    }
    return { timeoutMs: Math.max(1, Math.round(requestedMs)), timeoutNote: null };
}

function imageOf(output: InvocationOutput) {
    return output.kind === 'inline' && output.mediaType.startsWith('image/')
        ? ({ data: output.base64, mimeType: output.mediaType, type: 'image' } as const)
        : null;
}

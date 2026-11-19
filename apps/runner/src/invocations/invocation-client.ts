import {
    type DispatchKey,
    dispatchIdOf,
    type InvocationOperation,
    type InvocationOutcome,
    type InvocationOutput,
    type InvocationResultFrame,
    invocationOutcomeNotices,
    invocationTimeoutsMs,
} from '@haus/api';
import type { RunDispatches } from '../dispatch/dispatch-id.ts';
import type { RunAuthority, RunnerLink, ToolOutcome, ToolResultContent } from '../run-context.ts';
import { inlineInvocationPayload } from './invocation-payload.ts';

export type InvocationClient = ReturnType<typeof createInvocationClient>;

export interface InvocationAnswer {
    readonly frame: InvocationResultFrame;
    readonly timeoutNote: string | null;
    readonly timeoutMs: number;
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
    dispatches: RunDispatches;
    graceMs: number;
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
    return {
        async invoke(
            toolCallId: string,
            operation: InvocationOperation,
            options: { requestedTimeoutMs?: number; signal: AbortSignal }
        ) {
            const { timeoutMs, timeoutNote } = clampTimeout(
                operation.kind,
                options.requestedTimeoutMs
            );
            options.signal.throwIfAborted();
            const key = await input.dispatches.open(toolCallId, 'invocation');
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
                            clearTimeout(deadline);
                            open.delete(id);
                            resolve(read);
                        });
                    },
                };
                const deadline = setTimeout(() => {
                    pending.reading.abort();
                    if (!pending.answered) {
                        open.delete(id);
                        resolve(unknown(key));
                    }
                }, timeoutMs + input.graceMs);
                open.set(id, pending);
                options.signal.addEventListener('abort', onAbort, { once: true });
                input.link.send({
                    ...key,
                    agentId: input.agentId,
                    operation,
                    timeoutMs,
                    type: 'invocation-request',
                });
            });
            options.signal.removeEventListener('abort', onAbort);
            await input.dispatches.finish(key, frame.outcome);
            return { frame, timeoutMs, timeoutNote } satisfies InvocationAnswer;
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
        case 'unknown':
        case 'offline':
            return [invocationOutcomeNotices[outcome]];
        default:
            return outcome satisfies never;
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

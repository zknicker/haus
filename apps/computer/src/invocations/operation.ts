import {
    type InvocationBytes,
    type InvocationOperation,
    type InvocationOutput,
    type InvokeAccepted,
    type InvokeResult,
    invocationInlineBytesMax,
    type MachineInvocationOutcome,
    type ProcessExitFrame,
    type ScreenRefusal,
} from '@haus/api';
import type { ProcessRegistry } from './processes/process-registry.ts';

export type StopReason = 'cancel' | 'timeout';

export interface InvocationPayloads {
    fetch: (bytes: InvocationBytes, signal: AbortSignal) => Promise<Uint8Array>;
    store: (bytes: Uint8Array, mediaType: string, signal: AbortSignal) => Promise<InvocationOutput>;
}

export interface OperationContext {
    agentId: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    invocationId: string;
    logPath: string;
    payloads: InvocationPayloads;
    processes: ProcessRegistry;
    runId: string;
    sessionGeneration: number;
    signal: AbortSignal;
    timeoutMs: number;
}

export interface OperationResult {
    exitCode?: number;
    logPath?: string;
    outcome: Exclude<MachineInvocationOutcome, 'unknown'>;
    output: InvocationOutput;
    refusal?: ScreenRefusal;
    truncated: boolean;
}

export type OperationRunner<Kind extends InvocationOperation['kind']> = (
    operation: Extract<InvocationOperation, { kind: Kind }>,
    context: OperationContext
) => Promise<OperationResult>;

export type OperationRunners = { [Kind in InvocationOperation['kind']]: OperationRunner<Kind> };

export interface InvocationHandlerInput {
    agentsRoot: string;
    invocationLimit?: number;
    processLimit?: number;
    payloadsFor: (invocationId: string) => InvocationPayloads;
    /** Removes an archived session's clean worktrees and answers the unpushed ones it kept. */
    releaseWorktrees?: (agentId: string) => Promise<readonly string[]>;
    runners: OperationRunners;
    send: (frame: InvokeAccepted | InvokeResult | ProcessExitFrame) => boolean;
}

export interface InvocationHandler {
    connected: () => Promise<void>;
    disconnected: () => void;
    fence: (agentId: string) => Promise<void>;
    receive: (frame: unknown) => boolean;
    settled: () => Promise<void>;
}

export class PayloadTooLargeError extends Error {
    constructor(readonly sizeBytes: number) {
        super(`Payload of ${sizeBytes} bytes does not fit in a frame.`);
    }
}

export const inlinePayloads: InvocationPayloads = {
    fetch: async (bytes) => {
        if (bytes.kind !== 'inline') {
            throw new Error('This Computer cannot download invocation payloads.');
        }
        return Buffer.from(bytes.base64, 'base64');
    },
    store: async (bytes, mediaType) => {
        if (bytes.byteLength > invocationInlineBytesMax) {
            throw new PayloadTooLargeError(bytes.byteLength);
        }
        return { base64: Buffer.from(bytes).toString('base64'), kind: 'inline', mediaType };
    },
};

export function textResult(
    outcome: OperationResult['outcome'],
    text: string,
    extra: Pick<OperationResult, 'exitCode' | 'logPath' | 'truncated'> = { truncated: false }
) {
    return { ...extra, outcome, output: { kind: 'text' as const, text } };
}

export function stoppedOutcome(signal: AbortSignal) {
    if (!signal.aborted) {
        return null;
    }
    return signal.reason === 'timeout' ? ('timed-out' as const) : ('cancelled' as const);
}

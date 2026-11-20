import type { AgentReasoningEffort, RunnerModelConnection } from '@haus/api';
import type { RunTools } from '../run-context.ts';
import type { TurnEvent } from './turn-event.ts';

export const harnessIds = ['claude-agent-sdk', 'pi-durable'] as const;

export type HarnessId = (typeof harnessIds)[number];

export function harnessFor(modelId: string) {
    const harness: HarnessId = modelId.startsWith('claude-') ? 'claude-agent-sdk' : 'pi-durable';
    return harness;
}

export interface RuntimeLaunch {
    readonly agentDir: string;
    readonly agentId: string;
    readonly connection: RunnerModelConnection;
    readonly instructions: string;
    readonly modelId: string;
    readonly reasoningEffort: AgentReasoningEffort;
    readonly tools: RunTools;
}

export type RuntimeDriverFactory = (launch: RuntimeLaunch) => RuntimeDriver;

export interface RuntimeDriver {
    bootstrapFingerprint(signal?: AbortSignal): Promise<string>;
    readonly harness: HarnessId;
    readonly instructionsOnResume: 'current' | 'launched';
    openSession(options: OpenSessionOptions): Promise<RuntimeSession>;
}

export interface OpenSessionOptions {
    readonly resumeFrom: string | undefined;
    readonly sessionId: string;
    readonly signal?: AbortSignal;
}

export interface RuntimeSession {
    destroy(): Promise<void>;
    detach(): Promise<string>;
    readonly isResume: boolean;
    readonly sessionId: string;
    startTurn(options: { prompt: string; signal: AbortSignal }): Promise<RuntimeTurn>;
    steer(text: string): Promise<SteerResult>;
    stop(): Promise<string>;
}

export interface RuntimeTurn {
    readonly events: AsyncIterable<TurnEvent>;
    settle(): Promise<void>;
    unconsumedSteers(): readonly string[];
}

export type SteerResult =
    | { readonly delivered: true }
    | { readonly delivered: false; readonly reason: 'idle' }
    | { readonly delivered: false; readonly error: unknown; readonly reason: 'failed' };

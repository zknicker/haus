import type { InvocationOutcome } from '@haus/api';

export type TurnEvent =
    | { readonly nativeType: string; readonly type: 'progress' }
    | { readonly id: string; readonly type: 'reasoning-start' | 'reasoning-end' }
    | { readonly id: string; readonly text: string; readonly type: 'reasoning-delta' }
    | { readonly id: string; readonly text: string; readonly type: 'text-delta' }
    | ToolCallTurnEvent
    | ToolResultTurnEvent
    | ToolErrorTurnEvent
    | SessionFailureTurnEvent
    | {
          readonly contextTokens: number | null;
          readonly type: 'step-finish';
          readonly usage: RuntimeTokenUsage | null;
      }
    | {
          readonly claudePlanUsage: null;
          readonly type: 'turn-finish';
          readonly usage: RuntimeTokenUsage | null;
      }
    | { readonly error: unknown; readonly type: 'error' }
    | { readonly type: 'abort' };

interface ToolFacts {
    readonly nativeName?: string;
    readonly providerExecuted?: boolean;
    readonly toolCallId: string;
    readonly toolName: string;
}

export interface ToolCallTurnEvent extends ToolFacts {
    readonly input: unknown;
    readonly invalid?: boolean;
    readonly type: 'tool-call';
}

export interface ToolResultTurnEvent extends ToolFacts {
    readonly invocation?: InvocationOutcome;
    readonly isError?: boolean;
    readonly output: unknown;
    readonly type: 'tool-result';
}

export interface ToolErrorTurnEvent extends ToolFacts {
    readonly error: unknown;
    readonly type: 'tool-error';
}

export interface SessionFailureTurnEvent {
    readonly category: string;
    readonly severity: 'error' | 'warning';
    readonly title: string;
    readonly type: 'session-failure';
}

export interface RuntimeTokenUsage {
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
}

export const compactionToolName = 'compaction';

export function isFatalTurnEvent(event: TurnEvent) {
    return (
        event.type === 'error' ||
        (event.type === 'session-failure' &&
            (event.severity === 'error' || event.category === 'access'))
    );
}

export function addTokenUsage(current: RuntimeTokenUsage | null, next: RuntimeTokenUsage | null) {
    if (!(current && next)) {
        return next ?? current;
    }
    return {
        cacheReadTokens: current.cacheReadTokens + next.cacheReadTokens,
        cacheWriteTokens: current.cacheWriteTokens + next.cacheWriteTokens,
        inputTokens: current.inputTokens + next.inputTokens,
        outputTokens: current.outputTokens + next.outputTokens,
        totalTokens: current.totalTokens + next.totalTokens,
    };
}

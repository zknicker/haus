import type { ClaudeUsageSnapshot } from '@haus/claude-usage';

/**
 * The one event vocabulary every runtime driver emits for a turn (specs/runtime-drivers.md).
 * Drivers normalize their wire format into these; Computer consumers never read a runtime's
 * native payloads. Every event a driver emits counts as turn progress.
 */
export type TurnEvent =
    | ProgressTurnEvent
    | ReasoningTurnEvent
    | SessionFailureTurnEvent
    | SubagentTurnEvent
    | TextDeltaTurnEvent
    | ToolTurnEvent
    | TurnSettlementEvent;

export type ReasoningTurnEvent =
    | { readonly id: string; readonly type: 'reasoning-start' }
    | { readonly id: string; readonly text: string; readonly type: 'reasoning-delta' }
    | { readonly id: string; readonly type: 'reasoning-end' };

export interface TextDeltaTurnEvent {
    readonly id: string;
    readonly text: string;
    readonly type: 'text-delta';
}

export type ToolTurnEvent =
    | ToolCallTurnEvent
    | ToolErrorTurnEvent
    | ToolReadLocationTurnEvent
    | ToolResultTurnEvent;

/** Facts every tool event may carry about the call it belongs to. */
interface ToolCallFacts {
    /** The runtime treats the tool as dynamic (MCP or otherwise late-bound). */
    readonly dynamic?: boolean;
    /** The runtime's own name for the tool, when it differs from `toolName`. */
    readonly nativeName?: string;
    /** The runtime executed the tool itself (a builtin), not a Haus host tool. */
    readonly providerExecuted?: boolean;
    readonly toolCallId: string;
    readonly toolName: string;
}

export interface ToolCallTurnEvent extends ToolCallFacts {
    readonly input: unknown;
    /** The input failed the tool's schema; the call is still that tool. */
    readonly invalid?: boolean;
    /** The runtime call this synthetic call restates (an ACP edit's `fileChange`). */
    readonly sourceToolCallId?: string;
    readonly type: 'tool-call';
}

export interface ToolResultTurnEvent extends ToolCallFacts {
    readonly isError?: boolean;
    readonly output: unknown;
    /** A streamed partial result; the call is still running. */
    readonly preliminary?: boolean;
    readonly type: 'tool-result';
}

export interface ToolErrorTurnEvent extends ToolCallFacts {
    readonly error: unknown;
    readonly type: 'tool-error';
}

/** The one file a runtime read call names, reported ahead of the call itself. */
export interface ToolReadLocationTurnEvent {
    /** Absolute or runtime-relative path; consumers make it workspace-relative. */
    readonly path: string;
    readonly toolCallId: string;
    readonly type: 'tool-read-location';
}

/**
 * A sub-agent the runtime runs inside a delegating tool call. Lineage is explicit: the task id
 * pairs with the delegating call at `subagent-started`, and child calls name their parent.
 */
export type SubagentTurnEvent =
    | {
          readonly description?: string;
          readonly subagentType?: string;
          readonly taskId: string;
          readonly toolCallId: string;
          readonly type: 'subagent-started';
      }
    | {
          readonly description?: string;
          readonly taskId: string;
          readonly type: 'subagent-progress';
          readonly usage?: SubagentUsage;
      }
    | {
          /** Epoch milliseconds the runtime reports the task ended. */
          readonly endTime?: number;
          readonly status?: SubagentStatus;
          readonly taskId: string;
          readonly type: 'subagent-status';
          readonly usage?: SubagentUsage;
      }
    | {
          readonly input: unknown;
          readonly parentToolCallId: string;
          readonly toolCallId: string;
          readonly toolName: string;
          readonly type: 'subagent-tool-call';
      }
    | {
          readonly isError: boolean;
          readonly output: unknown;
          readonly parentToolCallId: string;
          readonly toolCallId: string;
          readonly type: 'subagent-tool-result';
      };

export type SubagentStatus = 'completed' | 'failed' | 'interrupted' | 'running';

export interface SubagentUsage {
    readonly durationMs: number;
    readonly toolUses: number;
    readonly totalTokens: number;
}

/**
 * A provider failure the runtime reported in-band. `error` ends the turn; a `warning` is a
 * retry notice, fatal only for a rejected credential (`category: 'access'`).
 */
export interface SessionFailureTurnEvent {
    readonly category: string;
    readonly severity: 'error' | 'warning';
    readonly title: string;
    readonly type: 'session-failure';
}

export type TurnSettlementEvent =
    | {
          /** The step's request input, cached tokens included: the context size. */
          readonly contextTokens: number | null;
          readonly type: 'step-finish';
          readonly usage: RuntimeTokenUsage | null;
      }
    | {
          readonly claudePlanUsage: ClaudeUsageSnapshot | null;
          readonly type: 'turn-finish';
          readonly usage: RuntimeTokenUsage | null;
      }
    | { readonly error: unknown; readonly type: 'error' }
    | { readonly type: 'abort' };

/** Liveness with no payload Haus reads; `nativeType` names the runtime's own event. */
export interface ProgressTurnEvent {
    readonly nativeType: string;
    readonly type: 'progress';
}

export interface RuntimeTokenUsage {
    cacheReadTokens: number;
    cacheWriteTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

/** The label a stall log names for the last event seen. */
export function turnEventLabel(event: TurnEvent): string {
    return event.type === 'progress' ? event.nativeType : event.type;
}

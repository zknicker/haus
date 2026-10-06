import type { AgentActivityEvent, AgentExecutionJournalReasoning } from '@haus/api';
import type { TurnTraceLane, TurnTraceTiming } from './turn-trace-timing.ts';
import type { TurnTraceStatus, TurnTraceTool, TurnTraceToolKind } from './turn-trace-tool-model.ts';

/**
 * The grouped trace slice 3 renders: one union per row shape. Every step sits
 * on the turn's time axis (`timing`) and may share lanes with overlapping
 * siblings (`parallel`).
 */
export interface TurnTraceStepBase {
    readonly caption: string | null;
    readonly key: string;
    /** Overlapping siblings share a group; null when the step ran alone. */
    readonly parallel: TurnTraceLane | null;
    /**
     * Title-only reasoning (Codex's `**Planning…**` lines) the Agent emitted
     * just before this step, oldest first; `caption` is the latest.
     */
    readonly thoughts: readonly string[];
    readonly timing: TurnTraceTiming;
}

export interface TurnTraceCallStep extends TurnTraceStepBase {
    readonly kind: 'call';
    readonly label: string;
    readonly status: TurnTraceStatus;
    readonly tool: TurnTraceTool;
}

export interface TurnTraceSubagentStep extends TurnTraceStepBase {
    /** The sub-agent's own calls, folded and laned exactly like top-level steps. */
    readonly children: readonly TurnTraceStep[];
    readonly kind: 'subagent';
    readonly label: string;
    readonly status: TurnTraceStatus;
    readonly tool: TurnTraceTool;
}

/** Consecutive same-kind calls folded into one expandable row. */
export interface TurnTraceFoldStep extends TurnTraceStepBase {
    /** Every member overlapped another: `Ran sleep 45 ×5` ran side by side. */
    readonly isParallel: boolean;
    readonly kind: 'fold';
    readonly label: string;
    readonly members: readonly TurnTraceCallStep[];
    readonly status: TurnTraceStatus;
    readonly toolKind: TurnTraceToolKind;
}

/** The Agent's Haus bookkeeping across the turn, folded into one muted row. */
export interface TurnTraceHausStep extends TurnTraceStepBase {
    readonly kind: 'haus';
    readonly label: string;
    readonly members: readonly TurnTraceCallStep[];
    readonly status: TurnTraceStatus;
}

export interface TurnTraceReasoningStep extends TurnTraceStepBase {
    readonly isStreaming: boolean;
    readonly kind: 'reasoning';
    readonly reasoning: AgentExecutionJournalReasoning;
}

/** Title-only reasoning with no step after it yet: the live "thinking" line, or the closing thought. */
export interface TurnTraceThoughtStep extends TurnTraceStepBase {
    readonly isStreaming: boolean;
    readonly kind: 'thought';
}

export interface TurnTraceEventStep extends TurnTraceStepBase {
    readonly event: AgentActivityEvent;
    readonly kind: 'event';
}

export type TurnTraceStep =
    | TurnTraceCallStep
    | TurnTraceEventStep
    | TurnTraceFoldStep
    | TurnTraceHausStep
    | TurnTraceReasoningStep
    | TurnTraceSubagentStep
    | TurnTraceThoughtStep;

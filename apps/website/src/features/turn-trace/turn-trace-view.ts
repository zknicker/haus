import type { AgentActivityEvent, AgentExecutionJournal } from '@haus/api';
import { readTraceError, type TurnTraceError } from './turn-trace-error.ts';
import { buildTurnTrace } from './turn-trace-model.ts';
import type { TurnTraceStep } from './turn-trace-step-types.ts';
import { buildTraceSteps } from './turn-trace-steps.ts';
import type { TurnTraceTool, TurnTraceToolKind } from './turn-trace-tool-model.ts';

export type * from './turn-trace-step-types.ts';
export type { TurnTraceLane, TurnTraceTiming } from './turn-trace-timing.ts';

/**
 * The presentation-ready trace for one turn: grouped steps on a shared time
 * axis, the turn's own failure, and its totals stated once. Pure: the caller
 * passes `now`, so a live view ticks by re-deriving with a fresh clock.
 */
export interface TurnTraceView {
    /** Why the turn itself failed (a harness error), separate from any call's failure. */
    readonly error: TurnTraceError | null;
    readonly status: AgentExecutionJournal['status'] | null;
    readonly steps: readonly TurnTraceStep[];
    readonly totals: TurnTraceTotals;
}

export interface TurnTraceTotals {
    /** Every call, nested sub-agent calls included; sub-agent rows themselves count in `subagents`. */
    readonly calls: number;
    readonly callsByKind: Readonly<Partial<Record<TurnTraceToolKind, number>>>;
    /** Wall time from the trace's first evidence to its last, or to `now` while running. */
    readonly durationMs: number | null;
    readonly failed: number;
    readonly images: number;
    readonly isRunning: boolean;
    readonly subagents: number;
}

export function buildTurnTraceView(
    journal: AgentExecutionJournal | null,
    events: readonly AgentActivityEvent[] = [],
    now: number = Date.now()
): TurnTraceView {
    const entries = buildTurnTrace(journal, events);
    const bounds = readBounds(journal, entries, now);
    const steps = buildTraceSteps(entries, { now, origin: bounds.start ?? now });
    const tools = entries.flatMap((entry) => (entry.kind === 'tool' ? flatten(entry.tool) : []));

    return {
        error: journal?.failure
            ? { exitCode: journal.failure.exitCode ?? null, message: journal.failure.message }
            : readTraceError(journal?.error),
        status: journal?.status ?? null,
        steps,
        totals: readTotals(tools, bounds),
    };
}

interface Bounds {
    readonly end: number | null;
    readonly isRunning: boolean;
    readonly start: number | null;
}

/**
 * The journal's own bounds, widened to any evidence outside them: a turn
 * redelivered mid-run can record a later start than the work it covers.
 */
function readBounds(
    journal: AgentExecutionJournal | null,
    entries: ReturnType<typeof buildTurnTrace>,
    now: number
): Bounds {
    const isRunning = journal?.status === 'running';
    const times: number[] = [];
    const ends: number[] = [];
    const push = (target: number[], value: string | undefined) => {
        const time = value ? Date.parse(value) : Number.NaN;
        if (!Number.isNaN(time)) {
            target.push(time);
        }
    };
    push(times, journal?.startedAt);
    push(ends, journal?.endedAt);
    for (const entry of entries) {
        push(times, entry.at);
        if (entry.kind === 'tool') {
            for (const tool of flatten(entry.tool)) {
                push(times, tool.source.startedAt);
                push(ends, tool.source.endedAt);
            }
        }
        if (entry.kind === 'reasoning') {
            push(ends, entry.reasoning.endedAt);
        }
    }
    if (times.length === 0) {
        return { end: null, isRunning, start: null };
    }
    const start = Math.min(...times);
    const end = isRunning ? now : Math.max(...ends, ...times);
    return { end, isRunning, start };
}

function readTotals(tools: readonly TurnTraceTool[], bounds: Bounds): TurnTraceTotals {
    const callsByKind: Partial<Record<TurnTraceToolKind, number>> = {};
    let calls = 0;
    for (const tool of tools) {
        callsByKind[tool.kind] = (callsByKind[tool.kind] ?? 0) + 1;
        calls += tool.kind === 'subagent' ? 0 : 1;
    }
    const duration =
        bounds.start === null || bounds.end === null ? null : bounds.end - bounds.start;
    return {
        calls,
        callsByKind,
        durationMs: duration !== null && duration > 0 ? duration : null,
        failed: tools.filter((tool) => tool.status === 'failed').length,
        images: tools.filter((tool) => tool.image?.media === 'image').length,
        isRunning: bounds.isRunning,
        subagents: callsByKind.subagent ?? 0,
    };
}

function flatten(tool: TurnTraceTool): TurnTraceTool[] {
    return [tool, ...tool.children.flatMap(flatten)];
}

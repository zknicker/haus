import { formatBookkeepingSummary, formatFoldLabel } from './turn-trace-fold-label.ts';
import type { TurnTraceEntry } from './turn-trace-model.ts';
import type {
    TurnTraceCallStep,
    TurnTraceFoldStep,
    TurnTraceHausStep,
    TurnTraceStep,
    TurnTraceSubagentStep,
} from './turn-trace-step-types.ts';
import {
    assignLanes,
    readTiming,
    spanTimings,
    type TraceClock,
    type TurnTraceTiming,
} from './turn-trace-timing.ts';
import type { TurnTraceStatus, TurnTraceTool } from './turn-trace-tool-model.ts';

/**
 * Steps from the flat trace. Title-only reasoning rides the next step as its
 * caption instead of breaking it apart; bookkeeping lifts out into one Haus
 * step where it first happened (unless bookkeeping is all the turn did);
 * consecutive same-kind calls fold; overlapping siblings share lanes.
 * Failures and interruptions never fold, so each is always its own row.
 */
export function buildTraceSteps(
    entries: readonly TurnTraceEntry[],
    clock: TraceClock
): TurnTraceStep[] {
    const flat = toFlatSteps(entries, clock);
    const hasWork = flat.some(
        (step) => (step.kind === 'call' && !step.tool.isBookkeeping) || step.kind === 'subagent'
    );
    const bookkeeping = hasWork
        ? flat.filter((step): step is TurnTraceCallStep => isBookkeeping(step))
        : [];
    const lifted = new Set<TurnTraceStep>(bookkeeping);
    const steps: TurnTraceStep[] = [];

    for (const step of flat) {
        if (lifted.has(step)) {
            if (step === bookkeeping[0]) {
                steps.push(toHausStep(bookkeeping));
            }
            continue;
        }
        const previous = steps.at(-1);
        if (step.kind === 'call' && previous && canFold(previous, step)) {
            steps[steps.length - 1] = toFoldStep([...membersOf(previous), step]);
            continue;
        }
        steps.push(step);
    }

    return withLanes(steps);
}

function toFlatSteps(entries: readonly TurnTraceEntry[], clock: TraceClock): TurnTraceStep[] {
    const steps: TurnTraceStep[] = [];
    let pending: PendingThought | null = null;

    for (const entry of entries) {
        const titles = entry.kind === 'reasoning' ? readThoughtTitles(entry.reasoning.text) : null;
        if (entry.kind === 'reasoning' && titles) {
            pending = extendThought(pending, entry, entry.isStreaming, titles);
            continue;
        }
        const thoughts = pending?.titles ?? [];
        pending = null;
        steps.push(toStep(entry, thoughts, clock));
    }
    const tail = pending as PendingThought | null;
    if (tail) {
        const timing = readTiming(tail.entry.at, undefined, tail.isStreaming, clock);
        steps.push({
            ...base(`thought:${tail.entry.key}`, timing, tail.titles),
            isStreaming: tail.isStreaming,
            kind: 'thought',
        });
    }
    return steps;
}

function extendThought(
    pending: PendingThought | null,
    entry: TurnTraceEntry,
    isStreaming: boolean,
    titles: readonly string[]
): PendingThought {
    return {
        entry: pending?.entry ?? entry,
        isStreaming,
        titles: [...(pending?.titles ?? []), ...titles],
    };
}

interface PendingThought {
    readonly entry: TurnTraceEntry;
    readonly isStreaming: boolean;
    readonly titles: readonly string[];
}

function toStep(
    entry: TurnTraceEntry,
    thoughts: readonly string[],
    clock: TraceClock
): TurnTraceStep {
    if (entry.kind === 'event') {
        const timing = readTiming(entry.at, entry.at, false, clock);
        return { ...base(entry.key, timing, thoughts), event: entry.event, kind: 'event' };
    }
    if (entry.kind === 'reasoning') {
        const { reasoning } = entry;
        const timing = readTiming(reasoning.startedAt, reasoning.endedAt, entry.isStreaming, clock);
        return {
            ...base(entry.key, timing, thoughts),
            isStreaming: entry.isStreaming,
            kind: 'reasoning',
            reasoning,
        };
    }
    return toToolStep(entry.tool, thoughts, clock);
}

function toToolStep(
    tool: TurnTraceTool,
    thoughts: readonly string[],
    clock: TraceClock
): TurnTraceCallStep | TurnTraceSubagentStep {
    const { source } = tool;
    const startedAt = source.subagent?.startedAt ?? source.startedAt;
    const endedAt = source.subagent?.endedAt ?? source.endedAt;
    const timing = readTiming(startedAt, endedAt, tool.status === 'running', clock);
    const common = {
        ...base(`tool:${source.toolCallId}`, timing, thoughts),
        label: tool.label,
        status: tool.status,
        tool,
    };
    if (tool.kind !== 'subagent') {
        return { ...common, kind: 'call' };
    }
    const children = tool.children.map((child) => ({
        at: child.source.startedAt,
        key: `tool:${child.source.toolCallId}`,
        kind: 'tool' as const,
        tool: child,
    }));
    return { ...common, children: buildTraceSteps(children, clock), kind: 'subagent' };
}

function isBookkeeping(step: TurnTraceStep): step is TurnTraceCallStep {
    return (
        step.kind === 'call' &&
        step.tool.isBookkeeping &&
        (step.status === 'completed' || step.status === 'running')
    );
}

function canFold(previous: TurnTraceStep, next: TurnTraceCallStep): boolean {
    if (!isFoldable(next)) {
        return false;
    }
    if (previous.kind === 'fold') {
        return previous.toolKind === next.tool.kind;
    }
    return (
        previous.kind === 'call' && isFoldable(previous) && previous.tool.kind === next.tool.kind
    );
}

/**
 * A failure or interruption is the row someone opened the trace for, and a
 * multi-line script is real work with its own name; neither hides in a fold.
 */
function isFoldable(step: TurnTraceCallStep): boolean {
    const settled = step.status === 'completed' || step.status === 'running';
    return settled && step.tool.scriptLines <= 1;
}

function membersOf(step: TurnTraceStep): TurnTraceCallStep[] {
    if (step.kind === 'fold') {
        return [...step.members];
    }
    return step.kind === 'call' ? [step] : [];
}

function toFoldStep(members: readonly TurnTraceCallStep[]): TurnTraceFoldStep {
    const [first] = members as [TurnTraceCallStep, ...TurnTraceCallStep[]];
    const status = rollupStatus(members);
    const labels = formatFoldLabel(
        first.tool.kind,
        members.map((member) => member.tool)
    );
    const lanes = assignLanes(members.map((member) => member.timing));
    const thoughts = members.flatMap((member) => member.thoughts);
    return {
        // The first call's key: a live call that gains a same-kind sibling
        // becomes this fold in place instead of leaving and re-entering.
        ...base(first.key, spanTimings(members.map((member) => member.timing)), thoughts),
        isParallel: lanes.every((lane) => lane !== null),
        kind: 'fold',
        label: status === 'running' ? labels.present : labels.past,
        members: members.map((member, index) => ({ ...member, parallel: lanes[index] ?? null })),
        status,
        toolKind: first.tool.kind,
    };
}

function toHausStep(members: readonly TurnTraceCallStep[]): TurnTraceHausStep {
    const [first] = members as [TurnTraceCallStep, ...TurnTraceCallStep[]];
    return {
        ...base(`haus:${first.key}`, sumTimings(members.map((member) => member.timing)), []),
        kind: 'haus',
        label: formatBookkeepingSummary(members.map((member) => member.tool)),
        members,
        status: rollupStatus(members),
    };
}

/** A group is running while any member runs; failed and interrupted calls never fold. */
function rollupStatus(members: readonly { status: TurnTraceStatus }[]): TurnTraceStatus {
    return members.some((member) => member.status === 'running') ? 'running' : 'completed';
}

/**
 * Bookkeeping is scattered across the turn, so its envelope would claim the
 * whole turn; the Haus row states the time it actually took, from its first call.
 */
function sumTimings(timings: readonly TurnTraceTiming[]): TurnTraceTiming {
    const total = timings.reduce((sum, timing) => sum + (timing.durationMs ?? 0), 0);
    return {
        durationMs: total > 0 ? total : null,
        isRunning: timings.some((timing) => timing.isRunning),
        offsetMs: timings[0]?.offsetMs ?? 0,
    };
}

function withLanes(steps: TurnTraceStep[]): TurnTraceStep[] {
    // Haus spans the whole turn by construction; laning it would mark everything parallel.
    const lanes = assignLanes(
        steps.map((step) =>
            step.kind === 'call' || step.kind === 'fold' || step.kind === 'subagent'
                ? step.timing
                : null
        )
    );
    return steps.map((step, index) => ({ ...step, parallel: lanes[index] ?? null }));
}

function base(key: string, timing: TurnTraceTiming, thoughts: readonly string[]) {
    return { caption: thoughts.at(-1) ?? null, key, parallel: null, thoughts, timing };
}

const titleLine = /^\*\*([^*\n]+)\*\*$/u;

/** A block made only of bold title lines; null when it carries real prose. */
export function readThoughtTitles(text: string): string[] | null {
    const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    const titles = lines.map((line) => titleLine.exec(line)?.[1]?.trim() ?? null);
    return titles.length > 0 && titles.every((title) => title) ? (titles as string[]) : null;
}

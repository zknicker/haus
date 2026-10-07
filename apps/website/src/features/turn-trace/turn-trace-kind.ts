import type { TurnTraceStep } from './turn-trace-step-types.ts';
import type { TurnTraceStatus, TurnTraceToolKind } from './turn-trace-tool-model.ts';

/**
 * What kind of work a step was, as the trace colors it. One hue per kind
 * paints the row's icon, its waterfall bar, and its overview segment, so a
 * kind reads the same wherever it shows. Haus bookkeeping stays neutral, and
 * a failure's danger overrides any hue.
 */
export type TraceKind =
    | 'file'
    | 'haus'
    | 'media'
    | 'shell'
    | 'subagent'
    | 'thinking'
    | 'tool'
    | 'web';

/** A step's kind, or null for a row with no bar (a message the Agent received). */
export function traceStepKind(step: TurnTraceStep): TraceKind | null {
    switch (step.kind) {
        case 'event':
            return null;
        case 'haus':
            return 'haus';
        case 'reasoning':
        case 'thought':
            return 'thinking';
        case 'subagent':
            return 'subagent';
        case 'fold':
            return traceToolKind(step.toolKind);
        case 'call':
            return isQuietCall(step.tool.isBookkeeping, step.status)
                ? 'haus'
                : traceToolKind(step.tool.kind);
        default:
            return null;
    }
}

/** Settled bookkeeping reads as Haus upkeep; a failed or interrupted one keeps its own mark. */
export function isQuietCall(isBookkeeping: boolean, status: TurnTraceStatus): boolean {
    return isBookkeeping && (status === 'completed' || status === 'running');
}

export function traceToolKind(kind: TurnTraceToolKind): TraceKind {
    return toolKinds[kind];
}

const toolKinds: Record<TurnTraceToolKind, TraceKind> = {
    compaction: 'haus',
    'file-change': 'file',
    'file-edit': 'file',
    'file-read': 'file',
    'file-write': 'file',
    generic: 'tool',
    image: 'media',
    mcp: 'tool',
    message: 'haus',
    search: 'file',
    shell: 'shell',
    subagent: 'subagent',
    web: 'web',
};

/** A kind's icon ink. Haus stays muted like the rest of its row. */
export const traceKindText: Record<TraceKind, string> = {
    file: 'text-trace-file',
    haus: 'text-muted',
    media: 'text-trace-media',
    shell: 'text-trace-shell',
    subagent: 'text-trace-subagent',
    thinking: 'text-trace-thinking',
    tool: 'text-trace-tool',
    web: 'text-trace-web',
};

/** A kind's bar and overview fill. */
export const traceKindFill: Record<TraceKind, string> = {
    file: 'bg-trace-file',
    haus: 'bg-trace-quiet',
    media: 'bg-trace-media',
    shell: 'bg-trace-shell',
    subagent: 'bg-trace-subagent',
    thinking: 'bg-trace-thinking',
    tool: 'bg-trace-tool',
    web: 'bg-trace-web',
};

import {
    type AgentExecutionJournalTool,
    isExecutionBookkeeping,
    unwrapShellCommand,
} from '@haus/api';
import type { ToolPartState } from '@heroui-pro/react/chat-tool';
import { readFailure, type TurnTraceError } from './turn-trace-error.ts';
import { type HausMessage, readHausMessage } from './turn-trace-haus-command.ts';
import { readTracePath, type TracePath } from './turn-trace-path.ts';
import { readShellLabel, type ShellLabel } from './turn-trace-shell-label.ts';
import {
    formatSubagentInterruption,
    formatSubagentLabel,
    resolveSubagentStatus,
} from './turn-trace-subagent.ts';
import type { TraceLabel } from './turn-trace-tense.ts';
import {
    blankToolFields,
    readToolFields,
    type TurnTraceToolFields,
} from './turn-trace-tool-fields.ts';
import {
    readHausImageStep,
    readToolImage,
    readToolLabels,
    type TurnTraceImage,
} from './turn-trace-tool-image.ts';
import { readRecord, readTraceText, stableJson } from './turn-trace-values.ts';

export type { TurnTraceToolFields, TurnTraceToolKind } from './turn-trace-tool-fields.ts';
export type { TurnTraceImage } from './turn-trace-tool-image.ts';

/**
 * A call's settled outcome. `warning` is a sub-agent that completed while one
 * of its own calls failed: done, but not cleanly.
 */
export type TurnTraceStatus = 'completed' | 'failed' | 'interrupted' | 'running' | 'warning';

export interface TurnTraceTool extends TurnTraceToolFields {
    /** A sub-agent's own calls, in order; empty for every other kind. */
    readonly children: readonly TurnTraceTool[];
    /** A muted line beside the label, such as a stdin script's first line. */
    readonly detail: string | null;
    readonly error: unknown;
    /** Other commands a compound shell script ran beyond the one its label names. */
    readonly extraCommands: number;
    /** Failed calls anywhere under a sub-agent. */
    readonly failedChildCount: number;
    /** The error as a person reads it; null unless the call failed. */
    readonly failure: TurnTraceError | null;
    /** A shell call that only ran `haus message send`: where it went and what it said. */
    readonly hausMessage: HausMessage | null;
    readonly image: TurnTraceImage | null;
    /** Stopped by the turn ending, not by failing: rendered calm, never as an error. */
    readonly interrupted: boolean;
    readonly interruption: string | null;
    /** Haus CLI calls and MEMORY.md upkeep: the Agent's bookkeeping, not its work. */
    readonly isBookkeeping: boolean;
    /** The label in the call's own tense: present while it runs. */
    readonly label: string;
    readonly labels: TraceLabel;
    readonly output: unknown;
    readonly preliminary: unknown;
    /** A finished sub-agent's report, model-authored markdown. */
    readonly report: string | null;
    /** A shell call's script lines outside heredoc bodies; 0 for every other kind. */
    readonly scriptLines: number;
    readonly source: AgentExecutionJournalTool;
    readonly state: ToolPartState;
    readonly status: TurnTraceStatus;
    /** The file a call is about, filename first. */
    readonly target: TracePath | null;
}

const interruptionReasons: Record<string, string> = {
    computer_restart: 'the Computer restarted',
    stream_abort: 'the run was stopped',
    stream_error: 'the execution stream failed',
};

export function classifyTraceTool(
    tool: AgentExecutionJournalTool,
    children: readonly TurnTraceTool[] = []
): TurnTraceTool {
    const name = tool.toolName.trim();
    // A call is a sub-agent by what the runtime reported, never by its wire name.
    const isSubagent = tool.subagent !== undefined || children.length > 0;
    const runStatus = resolveSubagentStatus(tool);
    const baseFields: TurnTraceToolFields = isSubagent
        ? { ...blankToolFields, kind: 'subagent' }
        : readToolFields(name, readRecord(tool.input) ?? {});
    const output = resolveTraceOutput(tool);
    const hausImage = readHausImageStep(baseFields, output);
    const fields: TurnTraceToolFields = hausImage ? { ...baseFields, kind: 'image' } : baseFields;
    const shell = fields.kind === 'shell' && fields.command ? readShellLabel(fields.command) : null;
    const labels = isSubagent ? readSubagentLabels(tool) : readToolLabels(fields, name, hausImage);
    const failedChildCount = countFailedChildren(tool, children);
    const error = resolveTraceError(tool);
    const target = fields.path ? readTracePath(fields.path) : null;
    // Haus CLI calls, message sends, and MEMORY.md upkeep: the Agent's bookkeeping, not its work.
    const isBookkeeping =
        !(isSubagent || hausImage) && isExecutionBookkeeping({ input: tool.input, toolName: name });

    return {
        ...fields,
        children,
        ...readShellFacts(shell),
        ...(hausImage?.cost ? { detail: hausImage.cost } : {}),
        error,
        failedChildCount,
        failure: runStatus === 'failed' ? readFailure(tool.failure, error) : null,
        hausMessage:
            isBookkeeping && fields.command
                ? readHausMessage(unwrapShellCommand(fields.command))
                : null,
        image: readToolImage({ fields, hausImage, input: tool.input, name, output }),
        interrupted: runStatus === 'interrupted',
        interruption: readInterruption(tool, isSubagent),
        isBookkeeping,
        label: runStatus === 'running' ? labels.present : labels.past,
        labels,
        output,
        preliminary: resolveTracePreliminary(tool),
        report: isSubagent && runStatus === 'completed' ? readTraceText(output) : null,
        source: tool,
        state: resolveToolPartState(tool),
        status: runStatus === 'completed' && failedChildCount > 0 ? 'warning' : runStatus,
        target,
    };
}

/**
 * Computer counts a sub-agent's failed calls when it serves the journal; the
 * nested children are the fallback for hand-built or older evidence.
 */
function countFailedChildren(
    tool: AgentExecutionJournalTool,
    children: readonly TurnTraceTool[]
): number {
    return (
        tool.subagent?.failedToolCount ??
        children.reduce(
            (count, child) => count + child.failedChildCount + (child.status === 'failed' ? 1 : 0),
            0
        )
    );
}

function readInterruption(tool: AgentExecutionJournalTool, isSubagent: boolean): string | null {
    return (
        formatInterruption(tool) ??
        (isSubagent ? formatSubagentInterruption(tool) : null) ??
        (resolveSubagentStatus(tool) === 'interrupted'
            ? 'The call stopped before it finished.'
            : null)
    );
}

/**
 * ChatTool has no stopped state. An interrupted call settles as a plain row so
 * only a real failure gets the danger frame; the row swaps in its own stop mark.
 */
export function resolveToolPartState(tool: AgentExecutionJournalTool): ToolPartState {
    const status = resolveSubagentStatus(tool);
    if (status === 'running') {
        return 'input-available';
    }
    return status === 'failed' ? 'output-error' : 'output-available';
}

/**
 * The Computer reports the settled result twice while a known relay bug leaves
 * `output` null, so the live value wins and `final` is the fallback.
 */
export function resolveTraceOutput(tool: AgentExecutionJournalTool): unknown {
    return tool.output ?? tool.final?.output ?? undefined;
}

export function resolveTraceError(tool: AgentExecutionJournalTool): unknown {
    return tool.error ?? tool.final?.error ?? undefined;
}

/** Preliminary output only earns a place when it differs from what settled. */
export function resolveTracePreliminary(tool: AgentExecutionJournalTool): unknown {
    const preliminary = tool.preliminary?.output;
    if (preliminary === undefined) {
        return undefined;
    }
    return stableJson(preliminary) === stableJson(resolveTraceOutput(tool))
        ? undefined
        : preliminary;
}

export function formatInterruption(tool: AgentExecutionJournalTool): string | null {
    const interruption = tool.interruptions?.at(-1);
    if (!interruption) {
        return null;
    }
    return `Interrupted because ${interruptionReasons[interruption.reason] ?? 'the run ended'}.`;
}

function readSubagentLabels(tool: AgentExecutionJournalTool): TraceLabel {
    const label = formatSubagentLabel(tool);
    return { past: label, present: label };
}

/** What a shell call's label leaves to the row: its detail, extra commands, and script size. */
function readShellFacts(shell: ShellLabel | null) {
    return {
        detail: shell?.detail ?? null,
        extraCommands: shell?.extraCommands ?? 0,
        scriptLines: shell?.lines ?? 0,
    };
}

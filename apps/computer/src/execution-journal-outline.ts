import {
    type AgentExecutionOutline,
    type AgentExecutionOutlineStep,
    type AgentExecutionOutlineStepKind,
    EXECUTION_OUTLINE_LABEL_MAX_CHARS,
    EXECUTION_OUTLINE_MAX_STEPS,
    type ExecutionToolKind,
    readExecutionToolKind,
} from '@haus/api';
import {
    type ComputerToolClassification,
    computerNativeToolActivityFixtures,
    computerSyntheticHarnessToolFixtures,
    isMcpName,
    knownToolCategory,
} from './harness/activity-tool-fixtures.ts';
import type {
    ComputerExecutionJournalDocument,
    ComputerExecutionJournalTool,
} from './harness/execution-journal.ts';
import { classifyShellCall, readShellCommand, unwrapShell } from './harness/haus-cli-command.ts';
import { describeToolAction } from './harness/thought-action.ts';
import { scrubCommandLine, scrubPhrase } from './harness/thought-action-scrub.ts';

const maxDepth = 16;

/**
 * The compact skeleton of one stored journal: each tool call and reasoning
 * block as a kind (a tool call also as the trace's call kind), a scrubbed
 * label, its place in the sub-agent tree, and its timing. Labels come from the same scrubbing that action thoughts use (ADR
 * 0036), so no tool input, output, report, or reasoning text leaves here.
 * Top-level steps are kept first when a run has more than the cap.
 */
export function outlineExecutionJournal(
    document: ComputerExecutionJournalDocument
): AgentExecutionOutline {
    const tree = readTree(document.tools);
    const drafts = [
        ...document.tools.map((tool) => draftTool(tool, tree)),
        ...(document.reasoning ?? []).map(
            (block): Draft => ({
                depth: 0,
                endMs: readTime(block.endedAt),
                id: block.id,
                kind: 'reasoning',
                label: 'Reasoning',
                startMs: readTime(block.startedAt) ?? Number.NaN,
                status: block.endedAt ? 'completed' : document.status,
            })
        ),
    ].filter((draft) => Number.isFinite(draft.startMs));
    const origin = Math.min(readTime(document.startedAt) ?? Number.NaN, ...drafts.map(startOf));
    const runStart = Number.isFinite(origin) ? origin : Date.parse(document.startedAt);
    const ends = drafts.flatMap((draft) => [draft.startMs, draft.endMs ?? draft.startMs]);
    const runEnd = readTime(document.endedAt) ?? Math.max(runStart, ...ends);

    const kept = [...drafts]
        .sort((left, right) => left.depth - right.depth || left.startMs - right.startMs)
        .slice(0, EXECUTION_OUTLINE_MAX_STEPS)
        .sort((left, right) => left.startMs - right.startMs);
    const omitted = drafts.length - kept.length;
    return {
        durationMs: Math.max(0, Math.round(runEnd - runStart)),
        ...(omitted > 0 ? { omittedSteps: omitted } : {}),
        runId: document.runId,
        startedAt: new Date(runStart).toISOString(),
        status: document.status,
        steps: kept.map((draft) => toStep(draft, runStart)),
    };
}

interface Draft {
    depth: number;
    endMs: number | null;
    failedToolCount?: number;
    id: string;
    kind: AgentExecutionOutlineStepKind;
    label: string;
    parentId?: string;
    startMs: number;
    status: AgentExecutionOutlineStep['status'];
    subagentLabel?: string;
    toolKind?: ExecutionToolKind;
}

interface Tree {
    readonly failedChildren: ReadonlyMap<string, number>;
    readonly parents: ReadonlyMap<string, string>;
}

function draftTool(tool: ComputerExecutionJournalTool, tree: Tree): Draft {
    const startMs = readTime(tool.startedAt) ?? Number.NaN;
    const endMs =
        readTime(tool.endedAt) ??
        (tool.durationMs === undefined ? null : startMs + tool.durationMs);
    const classification = classifyJournalTool(tool);
    const isSubagent = tool.subagent !== undefined;
    const kind: AgentExecutionOutlineStepKind = isSubagent
        ? 'subagent'
        : classification.outcome === 'skip'
          ? 'bookkeeping'
          : 'tool';
    return {
        depth: readDepth(tool.toolCallId, tree),
        endMs,
        id: tool.toolCallId,
        kind,
        label: describeJournalTool(tool, classification),
        ...(tool.parentToolCallId ? { parentId: tool.parentToolCallId } : {}),
        startMs,
        status: tool.status,
        ...(kind === 'tool' ? { toolKind: readExecutionToolKind(tool.toolName) } : {}),
        ...(tool.subagent
            ? {
                  failedToolCount: tree.failedChildren.get(tool.toolCallId) ?? 0,
                  subagentLabel: clip(scrubPhrase(tool.subagent.label)),
              }
            : {}),
    };
}

function toStep(draft: Draft, origin: number): AgentExecutionOutlineStep {
    return {
        depth: draft.depth,
        ...(draft.endMs === null
            ? {}
            : { durationMs: Math.max(0, Math.round(draft.endMs - draft.startMs)) }),
        id: draft.id,
        kind: draft.kind,
        label: draft.label,
        ...(draft.parentId ? { parentId: draft.parentId } : {}),
        startOffsetMs: Math.max(0, Math.round(draft.startMs - origin)),
        status: draft.status,
        ...(draft.subagentLabel === undefined
            ? {}
            : {
                  subagent: {
                      failedToolCount: draft.failedToolCount ?? 0,
                      label: draft.subagentLabel,
                  },
              }),
        ...(draft.toolKind === undefined ? {} : { toolKind: draft.toolKind }),
    };
}

/**
 * The journal records no runtime id, so a builtin's category comes from the
 * first runtime that names it; the runtimes agree on every shared name.
 */
function classifyJournalTool(tool: ComputerExecutionJournalTool): ComputerToolClassification {
    const synthetic =
        computerSyntheticHarnessToolFixtures[
            tool.toolName as keyof typeof computerSyntheticHarnessToolFixtures
        ];
    if (synthetic) {
        return synthetic === 'skip'
            ? { outcome: 'skip' }
            : { category: synthetic, outcome: 'activity' };
    }
    if (tool.subagent) {
        return { category: 'delegating', outcome: 'activity' };
    }
    if (isMcpName(tool.toolName) || isMcpName(tool.nativeName)) {
        return { category: 'using_tool', outcome: 'activity' };
    }
    const known = Object.keys(computerNativeToolActivityFixtures)
        .map((runtimeId) => knownToolCategory(runtimeId, tool.toolName, tool.nativeName))
        .find((category) => category !== undefined);
    return classifyShellCall(known ?? 'using_tool', tool.input);
}

/** The scrubbed action description, or the bare tool name for bookkeeping. */
/**
 * A shell call reads as its first command line, cut before any heredoc so a
 * message body or file content never rides the label; any other call reads as
 * its scrubbed action description, or its bare tool name.
 */
function describeJournalTool(
    tool: ComputerExecutionJournalTool,
    classification: ComputerToolClassification
): string {
    const command = readShellCommand(tool.input);
    if (command !== null) {
        const line = unwrapShell(command.trim()).split(/\r?\n|<</u)[0] ?? '';
        const scrubbed = scrubCommandLine(line);
        if (scrubbed.length > 0) {
            return clip(scrubbed);
        }
    }
    const described =
        classification.outcome === 'skip' || command !== null
            ? null
            : describeToolAction({
                  classification,
                  input: tool.input,
                  ...(tool.nativeName ? { nativeName: tool.nativeName } : {}),
                  toolName: tool.toolName,
              });
    const name = (tool.nativeName ?? tool.toolName).replace(/^mcp__/u, '').replaceAll('__', ' ');
    return clip(described ?? scrubPhrase(name));
}

function readTree(tools: readonly ComputerExecutionJournalTool[]): Tree {
    const failedChildren = new Map<string, number>();
    const parents = new Map<string, string>();
    for (const tool of tools) {
        if (tool.parentToolCallId) {
            parents.set(tool.toolCallId, tool.parentToolCallId);
            if (tool.status === 'failed') {
                failedChildren.set(
                    tool.parentToolCallId,
                    (failedChildren.get(tool.parentToolCallId) ?? 0) + 1
                );
            }
        }
    }
    return { failedChildren, parents };
}

/** Bounded, so a malformed parent cycle cannot spin. */
function readDepth(toolCallId: string, tree: Tree): number {
    let depth = 0;
    let parentId = tree.parents.get(toolCallId);
    while (parentId && depth < maxDepth) {
        depth += 1;
        parentId = tree.parents.get(parentId);
    }
    return depth;
}

function clip(text: string): string {
    return text.length <= EXECUTION_OUTLINE_LABEL_MAX_CHARS
        ? text
        : `${text.slice(0, EXECUTION_OUTLINE_LABEL_MAX_CHARS - 1)}…`;
}

function readTime(value: string | undefined): number | null {
    const time = value ? Date.parse(value) : Number.NaN;
    return Number.isNaN(time) ? null : time;
}

function startOf(draft: Draft): number {
    return draft.startMs;
}

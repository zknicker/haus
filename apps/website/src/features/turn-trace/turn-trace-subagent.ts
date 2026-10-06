import type { AgentExecutionJournalTool } from '@haus/api';
import { formatTraceDuration } from './turn-trace-duration.ts';
import type { TurnTraceTiming } from './turn-trace-timing.ts';
import { readRecord, readString } from './turn-trace-values.ts';

type SubagentStatus = AgentExecutionJournalTool['status'];

const defaultSubagentType = 'general-purpose';

const labelPrefixes: Record<SubagentStatus, string> = {
    completed: 'Ran sub-agent',
    failed: 'Sub-agent failed',
    interrupted: 'Sub-agent interrupted',
    running: 'Running sub-agent',
};

const compactCount = new Intl.NumberFormat('en', {
    maximumFractionDigits: 1,
    notation: 'compact',
});

/** The sub-agent's own status wins: the parent call can settle before it does. */
export function resolveSubagentStatus(tool: AgentExecutionJournalTool): SubagentStatus {
    return tool.subagent?.status ?? tool.status;
}

export function formatSubagentLabel(tool: AgentExecutionJournalTool): string {
    const input = readRecord(tool.input);
    const task =
        tool.subagent?.label ?? readString(input?.description) ?? readString(input?.subagent_type);
    const prefix = labelPrefixes[resolveSubagentStatus(tool)];
    return task ? `${prefix}: ${task}` : prefix;
}

/**
 * The row's trailing meta: how many calls it made. The runtime's usage is
 * authoritative once reported; until then the count is the child calls seen
 * so far.
 */
export function formatSubagentToolCount(
    tool: AgentExecutionJournalTool,
    childCount: number
): string | null {
    const toolUses = tool.subagent?.usage?.toolUses ?? childCount;
    return toolUses > 0 ? `${toolUses} ${toolUses === 1 ? 'tool' : 'tools'}` : null;
}

/**
 * The opened sub-agent's one muted line: its type when it is not the default
 * general-purpose one, its tokens, and how long it ran.
 */
export function formatSubagentDetails(
    tool: AgentExecutionJournalTool,
    timing: TurnTraceTiming
): string {
    const type = tool.subagent?.subagentType;
    const tokens = tool.subagent?.usage?.totalTokens ?? 0;
    return [
        type && type !== defaultSubagentType ? type : null,
        tokens > 0 ? `${compactCount.format(tokens)} tokens` : null,
        formatTraceDuration(timing.durationMs, { isRunning: timing.isRunning }),
    ]
        .filter(Boolean)
        .join(' · ');
}

export function formatSubagentInterruption(tool: AgentExecutionJournalTool): string | null {
    return resolveSubagentStatus(tool) === 'interrupted'
        ? 'The sub-agent stopped before it finished.'
        : null;
}

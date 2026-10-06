import type { AgentExecutionJournalTool } from '@haus/api';
import { readRecord, readString } from './turn-trace-values.ts';

type SubagentStatus = AgentExecutionJournalTool['status'];

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
 * Tool count and tokens for the row's trailing meta; the duration has its own
 * column. The runtime's usage is authoritative once reported; until then the
 * count is the child calls seen so far.
 */
export function formatSubagentMeta(tool: AgentExecutionJournalTool, childCount: number): string {
    const usage = tool.subagent?.usage;
    const toolUses = usage?.toolUses ?? childCount;
    return [
        toolUses > 0 ? `${toolUses} ${toolUses === 1 ? 'tool' : 'tools'}` : null,
        usage && usage.totalTokens > 0 ? `${compactCount.format(usage.totalTokens)} tokens` : null,
    ]
        .filter(Boolean)
        .join(' · ');
}

export function formatSubagentInterruption(tool: AgentExecutionJournalTool): string | null {
    return resolveSubagentStatus(tool) === 'interrupted'
        ? 'The sub-agent stopped before it finished.'
        : null;
}

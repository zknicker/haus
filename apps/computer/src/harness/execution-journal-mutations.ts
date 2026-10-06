/**
 * How one journal record changes a document.
 *
 * The live journal and the log replay share these appliers, so a replayed log
 * reproduces the document the turn held rather than approximating it.
 */
import { EXECUTION_JOURNAL_REASONING_MAX_BLOCKS } from '@haus/api';
import type { JournalMutationRecord } from './execution-journal-records';
import { applySubagent, settleSubagent } from './execution-journal-subagent';
import type {
    ComputerExecutionJournalDocument,
    ComputerExecutionJournalTool,
} from './execution-journal-types';
import { interruptTool } from './execution-journal-values';

/** Applies one record in place and reports whether it changed the document. */
export function applyJournalRecord(
    document: ComputerExecutionJournalDocument,
    record: JournalMutationRecord
): boolean {
    switch (record.type) {
        case 'tool-call':
            return applyToolCall(document, record);
        case 'tool-result':
            return applyToolResult(document, record);
        case 'subagent':
            return applySubagent(document, record);
        case 'reasoning-start':
            return applyReasoningStart(document, record);
        case 'reasoning-append':
            return applyReasoningAppend(document, record);
        case 'reasoning-end':
            return applyReasoningEnd(document, record);
        case 'interrupt':
            return applyInterrupt(document, record);
        default:
            return applyFinish(document, record);
    }
}

export function findJournalTool(
    document: ComputerExecutionJournalDocument,
    toolCallId: string
): ComputerExecutionJournalTool | undefined {
    return document.tools.find((candidate) => candidate.toolCallId === toolCallId);
}

export function findJournalReasoning(document: ComputerExecutionJournalDocument, id: string) {
    return document.reasoning?.find((candidate) => candidate.id === id);
}

function applyToolCall(
    document: ComputerExecutionJournalDocument,
    record: Extract<JournalMutationRecord, { type: 'tool-call' }>
): boolean {
    const existing = findJournalTool(document, record.toolCallId);
    const tool =
        existing ?? openTool(document, record.toolCallId, record.toolName, record.occurredAt);
    if (existing?.status === 'interrupted') {
        tool.status = 'running';
        tool.endedAt = undefined;
        tool.durationMs = undefined;
        tool.final = undefined;
        tool.output = undefined;
        tool.error = undefined;
    }
    tool.toolName = record.toolName;
    tool.nativeName ??= record.nativeName;
    tool.parentToolCallId ??= record.parentToolCallId;
    if (record.input !== undefined) {
        tool.input = record.input;
    }
    return true;
}

function applyToolResult(
    document: ComputerExecutionJournalDocument,
    record: Extract<JournalMutationRecord, { type: 'tool-result' }>
): boolean {
    const tool =
        findJournalTool(document, record.toolCallId) ??
        openTool(document, record.toolCallId, record.toolName, record.occurredAt);
    if (tool.final) {
        return false;
    }
    tool.toolName = record.toolName;
    tool.nativeName ??= record.nativeName;
    const result = record.isError
        ? { error: record.output, observedAt: record.occurredAt }
        : { observedAt: record.occurredAt, output: record.output };
    if (record.preliminary) {
        tool.preliminary = result;
    } else {
        tool.final = result;
        tool.status = record.isError ? 'failed' : 'completed';
        tool.endedAt = record.occurredAt;
        tool.durationMs = Math.max(0, Date.parse(record.occurredAt) - Date.parse(tool.startedAt));
        settleSubagent(tool, tool.status, record.occurredAt);
    }
    if (record.isError) {
        tool.error = record.output;
    } else {
        tool.output = record.output;
    }
    return true;
}

function applyReasoningStart(
    document: ComputerExecutionJournalDocument,
    record: Extract<JournalMutationRecord, { type: 'reasoning-start' }>
): boolean {
    const blocks = document.reasoning ?? [];
    if (
        findJournalReasoning(document, record.id) ||
        blocks.length >= EXECUTION_JOURNAL_REASONING_MAX_BLOCKS
    ) {
        return false;
    }
    blocks.push({ id: record.id, startedAt: record.startedAt, text: '' });
    document.reasoning = blocks;
    return true;
}

function applyReasoningAppend(
    document: ComputerExecutionJournalDocument,
    record: Extract<JournalMutationRecord, { type: 'reasoning-append' }>
): boolean {
    const block = findJournalReasoning(document, record.id);
    if (!block) {
        return false;
    }
    block.text += record.text;
    if (record.truncated) {
        block.truncated = true;
    }
    return true;
}

function applyReasoningEnd(
    document: ComputerExecutionJournalDocument,
    record: Extract<JournalMutationRecord, { type: 'reasoning-end' }>
): boolean {
    const block = findJournalReasoning(document, record.id);
    if (!block) {
        return false;
    }
    block.endedAt = record.endedAt;
    return true;
}

function applyInterrupt(
    document: ComputerExecutionJournalDocument,
    record: Extract<JournalMutationRecord, { type: 'interrupt' }>
): boolean {
    const at = new Date(record.at);
    let changed = false;
    for (const tool of document.tools) {
        if (tool.status !== 'running') {
            continue;
        }
        settleSubagent(tool, 'interrupted', record.at);
        if (record.status === 'interrupted') {
            interruptTool(tool, at, record.reason);
        } else {
            tool.status = 'failed';
            tool.endedAt = record.at;
            tool.durationMs = Math.max(0, at.getTime() - Date.parse(tool.startedAt));
            tool.error = record.error;
            tool.final = { error: record.error, observedAt: record.at };
        }
        changed = true;
    }
    return changed;
}

function applyFinish(
    document: ComputerExecutionJournalDocument,
    record: Extract<JournalMutationRecord, { type: 'finish' }>
): boolean {
    const at = Date.parse(record.at);
    for (const tool of document.tools) {
        settleSubagent(tool, 'interrupted', record.at);
        if (tool.status !== 'running') {
            continue;
        }
        tool.status = record.status === 'completed' ? 'failed' : record.status;
        tool.endedAt = record.at;
        tool.durationMs = Math.max(0, at - Date.parse(tool.startedAt));
        if (record.status === 'completed') {
            tool.error = { code: 'missing_result' };
            tool.final = { error: tool.error, observedAt: record.at };
        } else {
            tool.error = record.error ?? { code: record.status };
        }
    }
    document.status = record.status;
    document.endedAt = record.at;
    document.error = record.error;
    return true;
}

function openTool(
    document: ComputerExecutionJournalDocument,
    toolCallId: string,
    toolName: string,
    startedAt: string
): ComputerExecutionJournalTool {
    const tool: ComputerExecutionJournalTool = {
        startedAt,
        status: 'running',
        toolCallId,
        toolName,
    };
    document.tools.push(tool);
    return tool;
}

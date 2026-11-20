import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentInboxItem, PendingCounts } from '@haus/agent-prompt';
import {
    type AgentInboxLocation,
    inboxRoot,
    isMissingFile,
    writeJsonAtomic,
} from './inbox-store-io.ts';

export interface PendingInboxState extends PendingCounts {
    consumedMessageIds: string[];
    items: AgentInboxItem[];
    totalPending: number;
}

export async function readPendingState(location: AgentInboxLocation) {
    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(pendingPath(location), 'utf8'));
    } catch (error) {
        if (isMissingFile(error)) {
            return { consumedMessageIds: [], items: [], totalPending: 0 } as PendingInboxState;
        }
        throw error;
    }
    if (Array.isArray(parsed)) {
        return {
            consumedMessageIds: [],
            items: parsed as AgentInboxItem[],
            totalPending: parsed.length,
        } as PendingInboxState;
    }
    if (!(parsed && typeof parsed === 'object')) {
        throw new Error('Invalid local Agent inbox state.');
    }
    const record = parsed as Record<string, unknown>;
    if (
        (record.consumedMessageIds === undefined || Array.isArray(record.consumedMessageIds)) &&
        Array.isArray(record.items) &&
        Number.isInteger(record.totalPending)
    ) {
        return {
            consumedMessageIds: record.consumedMessageIds ?? [],
            items: record.items,
            ...(record.taskAssignments ? { taskAssignments: record.taskAssignments } : {}),
            ...(record.workerReports ? { workerReports: record.workerReports } : {}),
            totalPending: record.totalPending,
        } as PendingInboxState;
    }
    throw new Error('Invalid local Agent inbox state.');
}

export async function writePendingState(location: AgentInboxLocation, state: PendingInboxState) {
    await writeJsonAtomic(pendingPath(location), state);
}

function pendingPath(location: AgentInboxLocation) {
    return join(inboxRoot(location), 'pending.json');
}

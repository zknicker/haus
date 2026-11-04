import { type AgentTaskAssignment, agentTaskAssignmentSchema } from '@haus/api';

const keyPrefix = 'task-assign:';

/** The stable delivery identity of one assignment: one row per Task version. */
export function taskAssignmentKey(taskId: string, version: number): string {
    return `${keyPrefix}${taskId}:${version}`;
}

/** The Task an assignment identity names, or null for any other identity. */
export function taskIdOfAssignmentKey(dedupeKey: string): string | null {
    if (!dedupeKey.startsWith(keyPrefix)) {
        return null;
    }
    return dedupeKey.slice(keyPrefix.length).split(':')[0] || null;
}

/**
 * A `task_assignment` inbox row holds its typed attention as JSON: the assigner is
 * recorded nowhere else, and a resent run must rebuild the frame it first sent.
 * The Computer renders the Agent-facing envelope from these fields.
 */
export function encodeTaskAssignment(assignment: AgentTaskAssignment): string {
    return JSON.stringify(assignment);
}

/** A stored attention that no longer parses cannot be rendered truthfully, so it throws. */
export function decodeTaskAssignment(content: string): AgentTaskAssignment {
    return agentTaskAssignmentSchema.parse(JSON.parse(content));
}

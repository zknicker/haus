import { type AgentTaskAssignment, formatTaskTarget } from '@haus/api';

/** Assignments are concrete work: they arrive in a turn of their own, so nothing is pulled. */
export const taskAssignmentNoticeGuidance =
    'Their details arrive in your next turn. Keep working; the notice is not itself a request, so do not acknowledge it.';

/**
 * The command shapes ride the event; the standing Task principles stay in the prompt. Each
 * assigned Task is a place (ADR 0052), so the guidance names how to read and work it there.
 */
const taskAssignmentGuidance =
    '`haus task show <key>` prints a Task and `haus message read --target task:<key>` its conversation. Take them one at a time, by priority then age: set the one you start open with `haus task state <key> open` and work it there, leaving the rest in todo; skip any blocked on a person.';

/**
 * The input of a Task assignment run: how many, one line per Task, then how to take them. Each
 * line is the envelope the contract names, built here from the typed attention. A title or name
 * can hold anything a person typed, so none may open a new line or close the bracket.
 */
export function composeTaskAssignmentInput(assignments: readonly AgentTaskAssignment[]): string {
    return [
        `${assignments.length} ${assignments.length === 1 ? 'task' : 'tasks'} assigned to you:`,
        ...assignments.map(formatTaskAssignment),
        '',
        taskAssignmentGuidance,
    ].join('\n');
}

function formatTaskAssignment(task: AgentTaskAssignment): string {
    const assignedBy = task.assignedBy ? ` assignedBy=@${task.assignedBy}` : '';
    const fields = `target=${formatTaskTarget(task.key)} priority=${task.priority}${assignedBy}`;
    return `[Haus task assignment ${task.key} ${fields}] ${flattened(task.title)}`;
}

function flattened(value: string): string {
    return value.replaceAll(/\s+/gu, ' ').trim();
}

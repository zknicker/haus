import { type AgentTaskAssignment, formatTaskTarget } from '@haus/api';

export const taskAssignmentNoticeGuidance =
    'Their details arrive in your next turn. Keep working; the notice is not itself a request, so do not acknowledge it.';

const taskAssignmentGuidance =
    '`haus task show <key>` prints a Task and `haus message read --target task:<key>` its conversation. Take them one at a time, by priority then age: set the one you start open with `haus task state <key> open` and work it there, leaving the rest in todo; skip any blocked on a person.';

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

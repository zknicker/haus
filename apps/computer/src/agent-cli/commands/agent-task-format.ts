import { taskClaimConflictSchema } from '@haus/api';
import * as z from 'zod';
import { agentMessageSchema, taskActorSchema } from '../agent-api-schemas.ts';
import { AgentCliError } from '../agent-error.ts';
import { shortMessageId } from '../agent-format.ts';

export const taskRowSchema = z.object({
    assignee: taskActorSchema.nullable(),
    message: agentMessageSchema,
    number: z.number().int().positive(),
    status: z.enum(['todo', 'in_progress', 'in_review', 'done', 'closed']),
    target: z.string().nullable(),
    version: z.number().int().nonnegative(),
});
export type TaskRow = z.infer<typeof taskRowSchema>;

export const taskClaimResultSchema = z.object({
    claimConflict: taskClaimConflictSchema.nullable(),
    number: z.number().int().positive(),
    outcome: z.enum(['already_yours', 'claimed', 'refused']),
    reason: z.string().nullable(),
    task: taskRowSchema.nullable(),
});
type TaskClaimResult = z.infer<typeof taskClaimResultSchema>;

export function formatTaskList(tasks: TaskRow[], omitted: number): string {
    if (tasks.length === 0) {
        return 'No tasks found. A task is a message with task metadata — claim work with haus task claim, or create new work with haus task create.\n';
    }
    const more =
        omitted > 0
            ? `\nTruncated: ${omitted} more. Narrow with --target, --status, or --mine.`
            : '';
    return `${tasks.map((task) => taskLine(task)).join('\n')}${more}\n\nClaim before you work: haus task claim --target <target> --number <n>\n`;
}

/** Each created task names its own thread address as a reference. */
export function formatTasksCreated(tasks: TaskRow[], fallbackTarget: string): string {
    return `${tasks
        .map(
            (task) =>
                `Created task #${task.number} [${task.status}] in ${task.target ?? fallbackTarget}. Message ID: ${task.message.id}. Thread: ${threadRef(task, fallbackTarget)}.`
        )
        .join('\n')}\n`;
}

/** One row per requested task; granted rows carry their thread address. */
export function formatTaskClaims(results: TaskClaimResult[], fallbackTarget: string): string {
    const counts = [
        `${results.filter((row) => row.outcome === 'claimed').length} claimed`,
        countLabel(results, 'already_yours', 'already yours'),
        countLabel(results, 'refused', 'refused'),
    ].filter(Boolean);
    const lines = results.map((row) => claimLine(row, fallbackTarget));
    return `Claim results (${counts.join(', ')}):\n${lines.join('\n')}\n`;
}

/**
 * Zero granted rows is the only failure: a partial claim did work, and an
 * already-held claim still authorizes it. A lone lock conflict keeps the
 * structured conflict block.
 */
export function claimRefusal(results: TaskClaimResult[]): AgentCliError | null {
    if (results.some((row) => row.outcome !== 'refused')) {
        return null;
    }
    const [only] = results;
    if (results.length === 1 && only?.claimConflict) {
        return new AgentCliError('TASK_CONFLICT', only.reason ?? 'Claim refused.', {
            claimConflict: only.claimConflict,
        });
    }
    const summary = results.map((row) => `#${row.number} ${refusalReason(row)}`).join('; ');
    return new AgentCliError('TASK_CONFLICT', `Claim refused — ${summary}.`, {
        nextAction:
            'Do not retry the identical claim or start conflicting work. If you own this lane, correct the routing in the original thread.',
    });
}

export function assigneeLabel(assignee: TaskRow['assignee']) {
    if (!assignee) {
        return 'unassigned';
    }
    return assignee.handle ? `@${assignee.handle}` : `human:${assignee.id}`;
}

function claimLine(row: TaskClaimResult, fallbackTarget: string) {
    const id = row.task ? ` (msg:${shortMessageId(row.task.message.id)})` : '';
    if (row.outcome === 'refused') {
        return `#${row.number}${id}: refused — ${refusalReason(row)}`;
    }
    const outcome = row.outcome === 'claimed' ? 'claimed' : 'already yours';
    const thread = row.task ? ` · thread ${threadRef(row.task, fallbackTarget)}` : '';
    return `#${row.number}${id}: ${outcome}${thread}`;
}

function refusalReason(row: TaskClaimResult) {
    const holder = row.claimConflict?.currentAssignee?.name;
    return holder ? `held by @${holder}` : (row.reason ?? 'refused').replace(/\.$/u, '');
}

function countLabel(
    results: TaskClaimResult[],
    outcome: TaskClaimResult['outcome'],
    label: string
) {
    const count = results.filter((row) => row.outcome === outcome).length;
    return count > 0 ? `${count} ${label}` : '';
}

function threadRef(task: TaskRow, fallbackTarget: string) {
    return `"${task.target ?? fallbackTarget}:${shortMessageId(task.message.id)}"`;
}

function taskLine(task: TaskRow): string {
    const assignee = task.assignee ? ` ${assigneeLabel(task.assignee)}` : ' unassigned';
    const where = task.target ? ` in ${task.target}` : '';
    const title = task.message.content.replaceAll(/\s+/gu, ' ').trim();
    const clipped = title.length > 80 ? `${title.slice(0, 79)}…` : title;
    return `#${task.number} [${task.status}]${assignee}${where} rev=${task.version} msg=${shortMessageId(task.message.id)}: ${clipped}`;
}

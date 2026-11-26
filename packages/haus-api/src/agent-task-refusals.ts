import * as z from 'zod';

/**
 * Agent API refusal codes for Tasks as places (ADR 0053). Each rides an
 * `AgentApiError` `code` and carries a message saying why and what to do.
 *
 * - `WORKER_TASK_REQUIRED`: `haus worker start` named no Task; cloud
 *   work attaches to a Task and reports there (decision 6).
 * - `TASK_PROJECT_NOT_HOME`: a non-generalist Agent started a Task outside its
 *   home Project; that Project's Agent starts it when @mentioned in its channel
 *   (ADR 0055).
 * - `TASK_RECURRING_REMINDER`: a recurring reminder was set on a Task; only a
 *   one-time reminder may anchor on one (decision 16).
 * - `TASK_PROJECT_ARCHIVED`: a Task was restored while its Project is archived (ADR 0062).
 */
export const agentTaskRefusalCodes = [
    'WORKER_TASK_REQUIRED',
    'TASK_PROJECT_NOT_HOME',
    'TASK_RECURRING_REMINDER',
    'TASK_PROJECT_ARCHIVED',
] as const;

export const agentTaskRefusalCodeSchema = z.enum(agentTaskRefusalCodes);

export type AgentTaskRefusalCode = z.infer<typeof agentTaskRefusalCodeSchema>;

/** A Task's target, `task:k3mq7xta`, as Agent receipts and inbox rows name it. */
export const TASK_TARGET_PATTERN = /^task:([0-9a-hjkmnp-tv-z]{8})$/u;

export function formatTaskTarget(shortId: string): string {
    return `task:${shortId}`;
}

import * as z from 'zod';

/**
 * Agent API refusal codes for Tasks as places (ADR 0053). Each rides an
 * `AgentApiError` `code` and carries a message saying why and what to do.
 *
 * - `TASK_PROJECT_NOT_HOME`: a non-generalist Agent started a Task outside its
 *   home Project; that Project's Agent starts it when @mentioned in its channel
 *   (ADR 0055).
 * - `TASK_RECURRING_REMINDER`: a recurring reminder was set on a Task; only a
 *   one-time reminder may anchor on one (decision 16).
 * - `TASK_PROJECT_ARCHIVED`: a Task was restored while its Project is archived (ADR 0062).
 * - `TASK_ARCHIVED`: a Task sent to an archived Task; only people and Captains bring one back.
 * - `TASK_START_NOT_CAPTAIN`: an agent other than a Captain started a Task.
 */
export const agentTaskRefusalCodes = [
    'TASK_PROJECT_NOT_HOME',
    'TASK_RECURRING_REMINDER',
    'TASK_PROJECT_ARCHIVED',
    'TASK_ARCHIVED',
    'TASK_START_NOT_CAPTAIN',
] as const;

export const agentTaskRefusalCodeSchema = z.enum(agentTaskRefusalCodes);

export type AgentTaskRefusalCode = z.infer<typeof agentTaskRefusalCodeSchema>;

/** A Task's target, `task:k3mq7xta`, as Agent receipts and inbox rows name it. */
export const TASK_TARGET_PATTERN = /^task:([0-9a-hjkmnp-tv-z]{8})$/u;

export function formatTaskTarget(shortId: string): string {
    return `task:${shortId}`;
}

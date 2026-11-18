import * as z from 'zod';

/**
 * Agent API refusal codes for Tasks as places (ADR 0053). Each rides an
 * `AgentApiError` `code` and carries a message saying why and what to do.
 *
 * - `CLOUD_AGENT_TASK_REQUIRED`: `haus cloud-agent start` named no Task; cloud
 *   work attaches to a Task and reports there (decision 6).
 * - `TASK_ORIGIN_DM`: `tasks/start` named an origin Message in a DM; Tasks start
 *   from a Message in a Channel, and a DM request gets a reply with the chip
 *   (decision 4).
 * - `TASK_RECURRING_REMINDER`: a recurring reminder was set on a Task; only a
 *   one-time reminder may anchor on one (decision 16).
 */
export const agentTaskRefusalCodes = [
    'CLOUD_AGENT_TASK_REQUIRED',
    'TASK_ORIGIN_DM',
    'TASK_RECURRING_REMINDER',
] as const;

export const agentTaskRefusalCodeSchema = z.enum(agentTaskRefusalCodes);

export type AgentTaskRefusalCode = z.infer<typeof agentTaskRefusalCodeSchema>;

/** A Task's send target, `task:SEC-12`, as Agent receipts and inbox rows name it. */
export const TASK_TARGET_PATTERN = /^task:([A-Z][A-Z0-9]{1,4}-[1-9][0-9]*)$/u;

export function formatTaskTarget(taskKey: string): string {
    return `task:${taskKey}`;
}

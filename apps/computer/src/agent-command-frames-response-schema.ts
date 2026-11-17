import {
    agentHeartbeatAttentionSchema,
    agentHeartbeatReportAttentionSchema,
    agentSubagentWakeAttentionSchema,
    agentTaskAssignmentBatchLimit,
    agentTaskAssignmentNoticeSchema,
    agentTaskAssignmentSchema,
    heartbeatContextLimit,
    heartbeatDigestEntryLimit,
    heartbeatDigestEntrySchema,
    heartbeatLeadSchema,
    heartbeatReminderSchema,
} from '@haus/api';
import * as z from 'zod';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` chatless run attentions
 * (heartbeat, heartbeat report, sub-agent wake, Task assignment), loosened at
 * every nested object so an older Computer tolerates a field a newer Server
 * added instead of failing the whole `start` or `notice` command frame closed.
 */

const heartbeatDigestEntryResponseSchema = z.looseObject(heartbeatDigestEntrySchema.shape);
const heartbeatLeadResponseSchema = z.looseObject(heartbeatLeadSchema.shape);
const heartbeatReminderResponseSchema = z.looseObject(heartbeatReminderSchema.shape);

export const agentHeartbeatAttentionResponseSchema = z.looseObject({
    ...agentHeartbeatAttentionSchema.shape,
    digest: z.looseObject({
        entries: z.array(heartbeatDigestEntryResponseSchema).max(heartbeatDigestEntryLimit),
        more: z.number().int().nonnegative(),
    }),
    leads: z.array(heartbeatLeadResponseSchema).max(heartbeatContextLimit).default([]),
    reminders: z.array(heartbeatReminderResponseSchema).max(heartbeatContextLimit).default([]),
});

export const agentHeartbeatReportAttentionResponseSchema = z.looseObject(
    agentHeartbeatReportAttentionSchema.shape
);

export const agentSubagentWakeAttentionResponseSchema = z.looseObject(
    agentSubagentWakeAttentionSchema.shape
);

export const agentTaskAssignmentNoticeResponseSchema = z.looseObject(
    agentTaskAssignmentNoticeSchema.shape
);

export const agentTaskAssignmentsResponseSchema = z
    .array(z.looseObject(agentTaskAssignmentSchema.shape))
    .min(1)
    .max(agentTaskAssignmentBatchLimit);

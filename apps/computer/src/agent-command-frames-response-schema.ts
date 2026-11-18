import {
    agentSubagentWakeAttentionSchema,
    agentTaskAssignmentBatchLimit,
    agentTaskAssignmentNoticeSchema,
    agentTaskAssignmentSchema,
} from '@haus/api';
import * as z from 'zod';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` chatless run attentions
 * (sub-agent wake, Task assignment), loosened at every nested object so an older
 * Computer tolerates a field a newer Server added instead of failing the whole
 * `start` or `notice` command frame closed.
 */

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

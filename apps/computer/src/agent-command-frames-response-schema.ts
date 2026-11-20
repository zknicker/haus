import {
    agentSubagentWakeAttentionSchema,
    driveConflictAttentionSchema,
    driveConflictFileSchema,
    agentTaskAssignmentBatchLimit,
    agentTaskAssignmentNoticeSchema,
    agentTaskAssignmentSchema,
} from '@haus/api';
import * as z from 'zod';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` chatless run attentions
 * (sub-agent wake, Task assignment, Drive conflict), loosened at every nested object so an older
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

const [agentWriter, workerWriter] = driveConflictAttentionSchema.shape.writer.options;

export const driveConflictAttentionResponseSchema = z.looseObject({
    ...driveConflictAttentionSchema.shape,
    files: z.array(z.looseObject(driveConflictFileSchema.shape)).min(1),
    writer: z.discriminatedUnion('type', [
        z.looseObject(agentWriter.shape),
        z.looseObject(workerWriter.shape),
    ]),
});

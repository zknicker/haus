import { cloudAgentProviderSchema } from '@haus/api';
import * as z from 'zod';
import {
    cancelledRecordSchema,
    heldFollowUpRecordSchema,
    launchedRecordSchema,
    launchingRecordSchema,
    rejectedRecordSchema,
} from './turn-record.ts';

const workId = { workId: z.string() };
const preWorkerPredecessorSchema = z
    .object({
        provider: cloudAgentProviderSchema.default('cursor'),
        workId: z.string(),
        runId: z.string(),
        providerAgentId: z.string().nullable(),
        providerRunId: z.string().nullable(),
    })
    .transform(({ workId: predecessorWorkId, runId, ...predecessor }) => ({
        ...predecessor,
        turnId: runId,
        workerId: predecessorWorkId,
    }));

export const preWorkerTurnRecordSchema = z
    .discriminatedUnion('phase', [
        launchingRecordSchema.omit({ workerId: true }).extend(workId),
        heldFollowUpRecordSchema
            .omit({ predecessors: true, workerId: true })
            .extend({ ...workId, predecessors: z.array(preWorkerPredecessorSchema) }),
        cancelledRecordSchema.omit({ workerId: true }).extend(workId),
        launchedRecordSchema.omit({ workerId: true }).extend(workId),
        rejectedRecordSchema.omit({ workerId: true }).extend(workId),
    ])
    .transform(({ workId: workerId, ...record }) => ({ ...record, workerId }));

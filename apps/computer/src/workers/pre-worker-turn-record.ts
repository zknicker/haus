import * as z from 'zod';
import {
    cancelledRecordSchema,
    launchedRecordSchema,
    launchingRecordSchema,
    rejectedRecordSchema,
} from './turn-record.ts';

const workId = { workId: z.string() };
export const preWorkerTurnRecordSchema = z
    .discriminatedUnion('phase', [
        launchingRecordSchema.omit({ workerId: true }).extend(workId),
        cancelledRecordSchema.omit({ workerId: true }).extend(workId),
        launchedRecordSchema.omit({ workerId: true }).extend(workId),
        rejectedRecordSchema.omit({ workerId: true }).extend(workId),
    ])
    .transform(({ workId: workerId, ...record }) => ({ ...record, workerId }));

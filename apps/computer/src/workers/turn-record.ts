import { workerTurnStatusSchema } from '@haus/api';
import * as z from 'zod';

const launchSchema = z.object({
    environmentId: z.string().min(1).nullable().default(null),
    environmentName: z.string().min(1).nullable().default(null),
    providerAgentId: z.string().min(1),
    providerRunId: z.string().min(1).nullable(),
    providerUrl: z.string().nullable(),
    status: workerTurnStatusSchema,
    startedAt: z.iso.datetime().optional(),
});
const modelSchema = z
    .object({
        id: z.string().min(1),
        params: z.array(z.object({ id: z.string().min(1), value: z.string().min(1) })),
    })
    .nullable()
    .default(null);
const deliverySchema = z.object({
    attempts: z.number().int().positive(),
    firstAttemptAt: z.string().min(1),
    lastError: z.string(),
    nextAttemptAt: z.string().min(1),
    interruptedAt: z.string().min(1).nullable().default(null),
});

export const launchingRecordSchema = z.object({
    phase: z.literal('launching'),
    workerId: z.string(),
    deadlineAt: z.iso.datetime().optional(),
});
const sendingRecordSchema = z.object({
    phase: z.literal('sending'),
    workerId: z.string(),
    input: z.string().min(1),
    model: modelSchema,
    providerAgentId: z.string().min(1),
    predecessorTurnIds: z.array(z.string().min(1)),
    delivery: deliverySchema.nullable().default(null),
});
export const cancelledRecordSchema = z.object({
    phase: z.literal('cancelled'),
    workerId: z.string(),
});
export const launchedRecordSchema = z.object({
    phase: z.literal('launched'),
    workerId: z.string(),
    launch: launchSchema,
    autoInterrupted: z.boolean().default(false),
});
export const rejectedRecordSchema = z.object({
    phase: z.literal('rejected'),
    workerId: z.string(),
    errorCode: z.string().min(1).default('provider-launch-rejected'),
    summary: z.string().min(1).nullable().default(null),
});

export const workerTurnRecordSchema = z.discriminatedUnion('phase', [
    launchingRecordSchema,
    sendingRecordSchema,
    cancelledRecordSchema,
    launchedRecordSchema,
    rejectedRecordSchema,
]);
export type WorkerTurnRecord = z.infer<typeof workerTurnRecordSchema>;
export type WorkerTurnRecordInput = z.input<typeof workerTurnRecordSchema>;
export type WorkerSendingTurn = Extract<WorkerTurnRecord, { phase: 'sending' }>;
export interface WorkerTurnRejection {
    errorCode: string;
    summary: string;
}

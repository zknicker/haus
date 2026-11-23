import {
    idSchema,
    workerBranchSchema,
    workerNativeSessionIdSchema,
    workerTurnAttemptSchema,
    workerQuestionsSchema,
    workerTurnExitSchema,
} from '@haus/api';
import * as z from 'zod';
import { workerTurnStartResponseSchema } from '../command-frame-response-schema.ts';

export const computerTurnEndingSchema = z.object({
    branch: z.string().min(1).nullable(),
    branches: z.array(z.looseObject(workerBranchSchema.shape)).max(50),
    detail: z.string().min(1).max(500).nullable(),
    exit: workerTurnExitSchema,
});
export type ComputerTurnEnding = z.infer<typeof computerTurnEndingSchema>;

const shared = {
    attempt: workerTurnAttemptSchema,
    inputAccepted: z.boolean(),
    questions: workerQuestionsSchema.optional(),
    sessionId: workerNativeSessionIdSchema.nullable(),
    stopRequested: z.boolean(),
    workerMdRevisionId: idSchema.nullable(),
};
const token = z.string().min(1);

export const computerTurnRecordSchema = z.discriminatedUnion('phase', [
    z.object({ ...shared, frame: workerTurnStartResponseSchema, phase: z.literal('accepted') }),
    z.object({
        ...shared,
        frame: workerTurnStartResponseSchema,
        phase: z.literal('credentialed'),
        token,
    }),
    z.object({
        ...shared,
        frame: workerTurnStartResponseSchema,
        phase: z.literal('running'),
        token,
    }),
    z.object({ ...shared, ending: computerTurnEndingSchema, phase: z.literal('pushing') }),
    z.object({ ...shared, ending: computerTurnEndingSchema, phase: z.literal('ended') }),
]);
export type ComputerTurnRecord = z.infer<typeof computerTurnRecordSchema>;
export type ComputerTurnPhase = ComputerTurnRecord['phase'];

export const computerWorkerFileSchema = z.object({
    agentId: idSchema,
    repoPath: z.string().min(1).nullable(),
    worktreePath: z.string().min(1).nullable().default(null),
    turns: z.record(z.string(), computerTurnRecordSchema),
    version: z.literal(1),
    workerId: idSchema,
});
export type ComputerWorkerFile = z.infer<typeof computerWorkerFileSchema>;

const nextPhases: Record<ComputerTurnPhase, readonly ComputerTurnPhase[]> = {
    accepted: ['accepted', 'credentialed', 'ended'],
    credentialed: ['credentialed', 'running', 'ended'],
    ended: ['ended'],
    pushing: ['pushing', 'ended'],
    running: ['running', 'pushing'],
};

export function canAdvance(from: ComputerTurnPhase, to: ComputerTurnPhase) {
    return nextPhases[from].includes(to);
}

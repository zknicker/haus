import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { workerTurnModelSchema } from './cloud-agent-model.ts';
import { workerPlaceSchema } from './worker-place.ts';
import { workerRefSchema, workerRepositorySchema, workerTitleSchema } from './worker-shared.ts';

const composedInputMaxLength = 262_144;
const providerIdSchema = z.string().trim().min(1).max(200);
const predecessorTurnIdsSchema = z.array(idSchema).max(200);

/** Server to Computer: run this turn. Idempotent by `turnId`; `input` is already composed. */
export const workerTurnStartFrameSchema = z
    .object({
        input: z.string().min(1).max(composedInputMaxLength),
        model: workerTurnModelSchema,
        place: workerPlaceSchema,
        predecessorTurnIds: predecessorTurnIdsSchema,
        providerAgentId: providerIdSchema.nullable(),
        repository: workerRepositorySchema,
        startingRef: workerRefSchema.nullable(),
        title: workerTitleSchema,
        turnId: idSchema,
        type: z.literal('worker-turn-start'),
        workerId: idSchema,
    })
    .strict();
export type WorkerTurnStartFrame = z.infer<typeof workerTurnStartFrameSchema>;

/** Computer to Server: the turn is journaled, so a resent start never runs it twice. */
export const workerTurnAcceptedFrameSchema = z
    .object({ turnId: idSchema, type: z.literal('worker-turn-accepted') })
    .strict();
export type WorkerTurnAcceptedFrame = z.infer<typeof workerTurnAcceptedFrameSchema>;

/** Computer to Server: one follow-up still held in the Computer's local file, sent on connect. */
export const workerFollowUpDrainFrameSchema = z
    .object({
        instructions: z.string().min(1).max(composedInputMaxLength),
        predecessorTurnIds: predecessorTurnIdsSchema,
        providerAgentId: providerIdSchema.nullable(),
        providerRunId: providerIdSchema.nullable(),
        turnId: idSchema,
        type: z.literal('worker-follow-up-drain'),
        workerId: idSchema,
    })
    .strict();
export type WorkerFollowUpDrainFrame = z.infer<typeof workerFollowUpDrainFrameSchema>;

/** Server to Computer: the drained follow-up is the Server's now; the Computer may forget it. */
export const workerFollowUpDrainAckFrameSchema = z
    .object({ turnId: idSchema, type: z.literal('worker-follow-up-drain-ack') })
    .strict();
export type WorkerFollowUpDrainAckFrame = z.infer<typeof workerFollowUpDrainAckFrameSchema>;

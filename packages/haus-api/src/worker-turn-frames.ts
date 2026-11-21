import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { workerTurnModelSchema } from './cloud-agent-model.ts';
import {
    workerCheckoutSchema,
    workerNativeSessionIdSchema,
    workerTurnAttemptSchema,
} from './worker-computer-frames.ts';
import { workerPlaceSchema } from './worker-place.ts';
import { workerRuntimeSchema } from './worker-runtime.ts';
import { workerRefSchema, workerRepositorySchema, workerTitleSchema } from './worker-shared.ts';

const composedInputMaxLength = 262_144;
const providerIdSchema = z.string().trim().min(1).max(200);
const predecessorTurnIdsSchema = z.array(idSchema).max(200);

/**
 * Server to Computer: run this turn. Idempotent by `turnId`; `input` is
 * already composed. `attempt` counts sends, so a stale resend cannot launch.
 * A Computer place also gets its `runtime`, its `checkout`, and from the
 * second turn `resumeSessionId`; `model.id` is its requested model or null.
 * `workerMdRevisionId` is the WORKER.md revision `input` inlines, or null.
 */
export const workerTurnStartFrameSchema = z
    .object({
        agentId: idSchema,
        attempt: workerTurnAttemptSchema,
        checkout: workerCheckoutSchema.nullable(),
        input: z.string().min(1).max(composedInputMaxLength),
        model: workerTurnModelSchema,
        place: workerPlaceSchema,
        predecessorTurnIds: predecessorTurnIdsSchema,
        providerAgentId: providerIdSchema.nullable(),
        repository: workerRepositorySchema,
        resumeSessionId: workerNativeSessionIdSchema.nullable(),
        runtime: workerRuntimeSchema.nullable(),
        startingRef: workerRefSchema.nullable(),
        title: workerTitleSchema,
        turnId: idSchema,
        type: z.literal('worker-turn-start'),
        workerId: idSchema,
        workerMdRevisionId: idSchema.nullable(),
    })
    .strict();
export type WorkerTurnStartFrame = z.infer<typeof workerTurnStartFrameSchema>;

/** Computer to Server: the turn is journaled, so a resent start never runs it twice. */
export const workerTurnAcceptedFrameSchema = z
    .object({
        attempt: workerTurnAttemptSchema,
        turnId: idSchema,
        type: z.literal('worker-turn-accepted'),
    })
    .strict();
export type WorkerTurnAcceptedFrame = z.infer<typeof workerTurnAcceptedFrameSchema>;

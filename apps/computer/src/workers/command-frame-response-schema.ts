import {
    workerPlaceResponseSchema,
    workerReconcileEntryResponseSchema,
    workerTurnModelResponseSchema,
} from '@haus/agent-cli';
import {
    cloudAgentCapabilityRequestSchema,
    workerCheckoutSchema,
    workerCloseCommandSchema,
    workerFollowUpDrainAckFrameSchema,
    workerReconcileCommandSchema,
    workerStopCommandSchema,
    workerTurnStartFrameSchema,
} from '@haus/api';
import * as z from 'zod';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` Server→Computer Worker
 * command frames, loosened at every nested object so an older Computer
 * tolerates a field a newer Server added instead of failing the frame closed.
 */

export const workerStopCommandResponseSchema = z.looseObject({
    ...workerStopCommandSchema.shape,
    place: workerPlaceResponseSchema,
});

export const workerReconcileCommandResponseSchema = z.looseObject({
    ...workerReconcileCommandSchema.shape,
    workers: z.array(workerReconcileEntryResponseSchema).max(200),
});

export const workerTurnStartResponseSchema = z.looseObject({
    ...workerTurnStartFrameSchema.shape,
    checkout: z.looseObject(workerCheckoutSchema.shape).nullable(),
    model: workerTurnModelResponseSchema,
    place: workerPlaceResponseSchema,
});

export const workerFollowUpDrainAckResponseSchema = z.looseObject(
    workerFollowUpDrainAckFrameSchema.shape
);

export const workerCloseCommandResponseSchema = z.looseObject(workerCloseCommandSchema.shape);

const [
    getOperation,
    connectOperation,
    cancelSignInOperation,
    disconnectOperation,
    makeDefaultOperation,
    setEnvironmentOperation,
] = cloudAgentCapabilityRequestSchema.shape.operation.options;

export const cloudAgentCapabilityRequestResponseSchema = z.looseObject({
    ...cloudAgentCapabilityRequestSchema.shape,
    operation: z.discriminatedUnion('kind', [
        z.looseObject(getOperation.shape),
        z.looseObject(connectOperation.shape),
        z.looseObject(cancelSignInOperation.shape),
        z.looseObject(disconnectOperation.shape),
        z.looseObject(makeDefaultOperation.shape),
        z.looseObject(setEnvironmentOperation.shape),
    ]),
});

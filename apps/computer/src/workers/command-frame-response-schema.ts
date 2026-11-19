import {
    workerStopCommandSchema,
    cloudAgentCapabilityRequestSchema,
    workerReconcileCommandSchema,
} from '@haus/api';
import * as z from 'zod';
import { workerReconcileEntryResponseSchema } from '../agent-cli/worker-response-schema.ts';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` Server→Computer Cloud
 * Agent command frames, loosened at every nested object so an older Computer
 * tolerates a field a newer Server added instead of failing the frame closed.
 */

export const workerStopCommandResponseSchema = z.looseObject(workerStopCommandSchema.shape);

export const workerReconcileCommandResponseSchema = z.looseObject({
    ...workerReconcileCommandSchema.shape,
    work: z.array(workerReconcileEntryResponseSchema).max(200),
});

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

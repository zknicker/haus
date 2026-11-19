import type { WorkerStopCommand, WorkerReconcileCommand } from '@haus/api';
import {
    workerStopCommandResponseSchema,
    workerReconcileCommandResponseSchema,
} from './command-frame-response-schema.ts';

/** Validates the Server→Computer cancel command. Fails closed to null. */
export function parseWorkerStopCommand(frame: unknown): WorkerStopCommand | null {
    const parsed = workerStopCommandResponseSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Validates the reconnect reconciliation command. Fails closed to null. */
export function parseWorkerReconcileCommand(frame: unknown): WorkerReconcileCommand | null {
    const parsed = workerReconcileCommandResponseSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

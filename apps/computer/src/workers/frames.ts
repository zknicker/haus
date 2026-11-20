import type {
    WorkerFollowUpDrainAckFrame,
    WorkerReconcileCommand,
    WorkerStopCommand,
    WorkerTurnStartFrame,
} from '@haus/api';
import {
    workerCloseCommandResponseSchema,
    workerFollowUpDrainAckResponseSchema,
    workerReconcileCommandResponseSchema,
    workerStopCommandResponseSchema,
    workerTurnStartResponseSchema,
} from './command-frame-response-schema.ts';

/** Validates the Server→Computer stop command. Fails closed to null. */
export function parseWorkerStopCommand(frame: unknown): WorkerStopCommand | null {
    const parsed = workerStopCommandResponseSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Validates the reconnect reconciliation command. Fails closed to null. */
export function parseWorkerReconcileCommand(frame: unknown): WorkerReconcileCommand | null {
    const parsed = workerReconcileCommandResponseSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Validates the Server's start of one turn. Fails closed to null. */
export function parseWorkerTurnStart(frame: unknown): WorkerTurnStartFrame | null {
    const parsed = workerTurnStartResponseSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

export function parseWorkerCloseCommand(frame: unknown) {
    const parsed = workerCloseCommandResponseSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Validates the Server's acknowledgement of one drained follow-up. Fails closed to null. */
export function parseWorkerFollowUpDrainAck(frame: unknown): WorkerFollowUpDrainAckFrame | null {
    const parsed = workerFollowUpDrainAckResponseSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

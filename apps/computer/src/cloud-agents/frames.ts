import type { CloudAgentCancelCommand, CloudAgentReconcileCommand } from '@haus/api';
import {
    cloudAgentCancelCommandSchema,
    cloudAgentInputAnsweredCommandSchema,
    cloudAgentNativeUpdatedCommandSchema,
    cloudAgentReconcileCommandSchema,
} from '@haus/api';

/** Validates the Server→Computer cancel command. Fails closed to null. */
export function parseCloudAgentCancelCommand(frame: unknown): CloudAgentCancelCommand | null {
    const parsed = cloudAgentCancelCommandSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Validates the reconnect reconciliation command. Fails closed to null. */
export function parseCloudAgentReconcileCommand(frame: unknown): CloudAgentReconcileCommand | null {
    const parsed = cloudAgentReconcileCommandSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Native changes wake the monitor; its next read owns the canonical state. */
export function parseCloudAgentNativeUpdate(
    frame: unknown
): { workId: string; runId: string } | null {
    const answered = cloudAgentInputAnsweredCommandSchema.safeParse(frame);
    if (answered.success) {
        return answered.data;
    }
    const updated = cloudAgentNativeUpdatedCommandSchema.safeParse(frame);
    return updated.success ? updated.data : null;
}

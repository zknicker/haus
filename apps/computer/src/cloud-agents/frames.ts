import type { CloudAgentCancelCommand, CloudAgentReconcileCommand } from '@haus/api';

import {
    cloudAgentCancelCommandResponseSchema,
    cloudAgentReconcileCommandResponseSchema,
} from './command-frame-response-schema.ts';

/** Validates the Server→Computer cancel command. Fails closed to null. */
export function parseCloudAgentCancelCommand(frame: unknown): CloudAgentCancelCommand | null {
    const parsed = cloudAgentCancelCommandResponseSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Validates the reconnect reconciliation command. Fails closed to null. */
export function parseCloudAgentReconcileCommand(frame: unknown): CloudAgentReconcileCommand | null {
    const parsed = cloudAgentReconcileCommandResponseSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

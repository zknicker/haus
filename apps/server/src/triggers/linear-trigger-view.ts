import {
    type LinearTriggerView,
    linearTriggerDisplaySchema,
    linearTriggerGroupsSchema,
} from '@haus/api';
import type { linearTriggerConfigsTable } from '../postgres/schema.ts';

/** A `linear` Trigger's stored configuration and its workspace. */
export interface LinearTriggerRow {
    config: typeof linearTriggerConfigsTable.$inferSelect;
    workspace: { connectionId: string | null; name: string };
}

/**
 * The wire `linear` block. Stored groups are validated on the way out, so a
 * row that no longer matches the contract fails the read instead of reaching
 * a client half-formed.
 */
export function toLinearTriggerView(row: LinearTriggerRow): LinearTriggerView {
    const { config } = row;
    return {
        connectionId: row.workspace.connectionId,
        display: linearTriggerDisplaySchema.parse(config.display),
        groups: linearTriggerGroupsSchema.parse(config.groups),
        problem: config.problem,
        problemSince: config.problemSince?.toISOString() ?? null,
        selfSuppressedCount: config.selfSuppressedCount,
        suppressedCount: config.suppressedCount,
        workspaceName: row.workspace.name,
    };
}

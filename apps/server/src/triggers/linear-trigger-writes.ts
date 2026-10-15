import type { LinearTrigger, Trigger } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { LinearTriggerConfigAuthoring } from '../linear/trigger-references.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { linearTriggerConfigsTable, triggersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    type LinearAuthoringDependencies,
    resolveLinearTriggerConfig,
    validateLinearTriggerConfig,
} from './linear-trigger-config.ts';
import { type TriggerClock, TriggerRequestRefusedError } from './trigger-model.ts';
import { readTrigger } from './trigger-queries.ts';
import type { TriggerAnchor, TriggerAuthorization } from './trigger-writes.ts';

/**
 * Row writes for `linear` Triggers, shared by the Agent and operator paths.
 * Names resolve against Linear before the transaction; the workspace, grant,
 * and cap are re-checked inside it, behind the Server lock.
 */

export interface CreateLinearTriggerRowInput {
    /** The human who created it, or null when the owning Agent created it itself. */
    createdByUserId: string | null;
    instruction: string | null;
    linear: LinearTriggerConfigAuthoring;
    origin: string;
    ownerAgentId: string;
    serverId: string;
    title: string;
}

/** Creates one armed `linear` Trigger. It has no secret and no URL. */
export async function createLinearTriggerRow(
    dependencies: LinearAuthoringDependencies,
    input: CreateLinearTriggerRowInput,
    resolveAnchor: (tx: HausDatabase, triggerId: string) => Promise<TriggerAnchor>,
    clock: TriggerClock
): Promise<{ event: PreparedRealtimeEvent | null; trigger: LinearTrigger }> {
    const now = clock.now();
    const resolved = await resolveLinearTriggerConfig(dependencies, {
        config: input.linear,
        now,
        ownerAgentId: input.ownerAgentId,
        serverId: input.serverId,
    });
    const triggerId = createOpaqueId('trg');
    return await dependencies.db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const anchor = await resolveAnchor(tx, triggerId);
        const config = await validateLinearTriggerConfig(tx, {
            editingTriggerId: null,
            ownerAgentId: input.ownerAgentId,
            resolved,
            serverId: input.serverId,
        });
        await tx.insert(triggersTable).values({
            anchorChatId: anchor.chatId,
            anchorMessageId: anchor.messageId,
            createdAt: now,
            createdByUserId: input.createdByUserId,
            id: triggerId,
            instruction: input.instruction,
            kind: 'linear',
            ownerAgentId: input.ownerAgentId,
            secretHash: null,
            serverId: input.serverId,
            status: 'armed',
            title: input.title.trim(),
            updatedAt: now,
        });
        await tx
            .insert(linearTriggerConfigsTable)
            .values({ ...config, serverId: input.serverId, triggerId });
        return {
            event: anchor.event ?? null,
            trigger: requireLinearTrigger(
                await readTrigger(tx, { origin: input.origin, serverId: input.serverId, triggerId })
            ),
        };
    });
}

/**
 * Replaces a `linear` Trigger's groups whole, and its title or instruction
 * when given. A valid configuration clears any standing problem: the edit is
 * the fix. The anchor, owner, and kind never move.
 */
export async function updateLinearTriggerRow(
    dependencies: LinearAuthoringDependencies,
    input: {
        instruction?: string | null;
        linear: LinearTriggerConfigAuthoring;
        origin: string;
        serverId: string;
        title?: string;
        triggerId: string;
    },
    authorize: TriggerAuthorization,
    clock: TriggerClock
): Promise<Trigger> {
    const now = clock.now();
    const before = requireLinearTrigger(await readTrigger(dependencies.db, input));
    const resolved = await resolveLinearTriggerConfig(dependencies, {
        config: input.linear,
        now,
        ownerAgentId: before.ownerAgentId,
        serverId: input.serverId,
    });
    return await dependencies.db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await authorize(tx);
        const current = requireLinearTrigger(await readTrigger(tx, input));
        const config = await validateLinearTriggerConfig(tx, {
            editingTriggerId: current.id,
            ownerAgentId: current.ownerAgentId,
            resolved,
            serverId: input.serverId,
        });
        await tx
            .update(linearTriggerConfigsTable)
            .set(config)
            .where(
                and(
                    eq(linearTriggerConfigsTable.serverId, input.serverId),
                    eq(linearTriggerConfigsTable.triggerId, current.id)
                )
            );
        await tx
            .update(triggersTable)
            .set({
                ...(input.title === undefined ? {} : { title: input.title.trim() }),
                ...(input.instruction === undefined
                    ? {}
                    : { instruction: input.instruction?.trim() || null }),
                updatedAt: now,
                version: current.version + 1,
            })
            .where(
                and(eq(triggersTable.serverId, input.serverId), eq(triggersTable.id, current.id))
            );
        return await readTrigger(tx, input);
    });
}

/** Narrows to a `linear` Trigger, the only kind with a Linear configuration. */
export function requireLinearTrigger(trigger: Trigger): LinearTrigger {
    if (trigger.kind !== 'linear') {
        throw new TriggerRequestRefusedError(
            'trigger_kind_mismatch',
            `A ${trigger.kind === 'github' ? 'GitHub' : 'webhook'} Trigger has no Linear configuration.`
        );
    }
    return trigger;
}

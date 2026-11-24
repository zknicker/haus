import type { ReminderScriptCommand } from '@haus/api';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    reminderAgentAttentionTable,
    reminderFiresTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';

type Reader = Pick<HausDatabase, 'select'>;

interface ScriptTransport {
    send(computerId: string, frame: ReminderScriptCommand): boolean;
}

export async function sendReminderScript(
    db: HausDatabase,
    transport: ScriptTransport,
    computerId: string,
    command: ReminderScriptCommand
) {
    const target = { attentionId: command.attentionId, computerId };
    const claim = await claimReminderScript(db, target);
    if (claim && !transport.send(computerId, command) && claim.fresh) {
        await releaseReminderScript(db, { ...target, ...claim });
    }
}

export async function claimReminderScript(
    db: HausDatabase,
    input: { attentionId: string; computerId: string }
) {
    const [owner] = await db
        .select({ serverId: reminderAgentAttentionTable.serverId })
        .from(reminderAgentAttentionTable)
        .where(eq(reminderAgentAttentionTable.id, input.attentionId))
        .limit(1);
    if (!owner) {
        return null;
    }
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, owner.serverId);
        const [row] = await tx
            .select({
                dispatchedComputerId: reminderAgentAttentionTable.dispatchedComputerId,
                dispatchedPlacementGeneration:
                    reminderAgentAttentionTable.dispatchedPlacementGeneration,
                machineId: agentsTable.computerId,
                placementGeneration: agentsTable.placementGeneration,
            })
            .from(reminderAgentAttentionTable)
            .innerJoin(
                agentsTable,
                and(
                    eq(agentsTable.serverId, reminderAgentAttentionTable.serverId),
                    eq(agentsTable.id, reminderAgentAttentionTable.agentId)
                )
            )
            .where(eq(reminderAgentAttentionTable.id, input.attentionId))
            .limit(1);
        if (!row) {
            return null;
        }
        const claim = { placementGeneration: row.placementGeneration, serverId: owner.serverId };
        if (row.dispatchedComputerId !== null) {
            const current =
                row.dispatchedComputerId === input.computerId &&
                row.dispatchedPlacementGeneration === row.placementGeneration;
            return current ? { ...claim, fresh: false } : null;
        }
        if (row.machineId !== input.computerId) {
            return null;
        }
        await tx
            .update(reminderAgentAttentionTable)
            .set({
                dispatchedComputerId: input.computerId,
                dispatchedPlacementGeneration: row.placementGeneration,
            })
            .where(eq(reminderAgentAttentionTable.id, input.attentionId));
        return { ...claim, fresh: true };
    });
}

async function releaseReminderScript(
    db: HausDatabase,
    input: {
        attentionId: string;
        computerId: string;
        placementGeneration: number;
        serverId: string;
    }
) {
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await tx
            .update(reminderAgentAttentionTable)
            .set({ dispatchedComputerId: null, dispatchedPlacementGeneration: null })
            .where(
                and(
                    eq(reminderAgentAttentionTable.id, input.attentionId),
                    eq(reminderAgentAttentionTable.dispatchedComputerId, input.computerId),
                    eq(
                        reminderAgentAttentionTable.dispatchedPlacementGeneration,
                        input.placementGeneration
                    )
                )
            );
    });
}

export function scriptsFor(computerId: string) {
    return or(
        eq(reminderAgentAttentionTable.dispatchedComputerId, computerId),
        and(
            isNull(reminderAgentAttentionTable.dispatchedComputerId),
            eq(agentsTable.computerId, computerId)
        )
    );
}

export async function hasOutstandingScripts(
    db: Reader,
    input: { agentId: string; computerId: string; serverId: string }
) {
    const [row] = await db
        .select({ id: reminderAgentAttentionTable.id })
        .from(reminderAgentAttentionTable)
        .where(outstandingOn(input))
        .limit(1);
    return row !== undefined;
}

export async function abandonReminderScripts(
    tx: HausDatabase,
    input: { agentId: string; computerId: string; serverId: string }
) {
    const abandoned = await tx
        .delete(reminderAgentAttentionTable)
        .where(outstandingOn(input))
        .returning({ fireId: reminderAgentAttentionTable.fireId });
    if (abandoned.length === 0) {
        return;
    }
    await tx
        .update(reminderFiresTable)
        .set({ outcome: 'failed', scriptOutput: abandonedOutput })
        .where(
            and(
                eq(reminderFiresTable.serverId, input.serverId),
                inArray(
                    reminderFiresTable.id,
                    abandoned.map((row) => row.fireId)
                )
            )
        );
}

const abandonedOutput =
    'The Captain’s Machine changed while this check was on its old Machine, which was offline, so Haus did not use or rerun it.';

function outstandingOn(input: { agentId: string; computerId: string; serverId: string }) {
    return and(
        eq(reminderAgentAttentionTable.serverId, input.serverId),
        eq(reminderAgentAttentionTable.agentId, input.agentId),
        eq(reminderAgentAttentionTable.dispatchedComputerId, input.computerId)
    );
}

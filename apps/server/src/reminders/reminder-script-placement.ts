import type { ReminderScriptCommand } from '@haus/api';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    reminderAgentAttentionTable,
    reminderFiresTable,
} from '../postgres/schema.ts';

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
    const [row] = await db
        .select({
            dispatchedComputerId: reminderAgentAttentionTable.dispatchedComputerId,
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
        .where(eq(reminderAgentAttentionTable.id, command.attentionId))
        .limit(1);
    if (!row || (row.dispatchedComputerId !== null && row.dispatchedComputerId !== computerId)) {
        return;
    }
    const fresh = row.dispatchedComputerId === null;
    if (fresh) {
        const [claimed] = await db
            .update(reminderAgentAttentionTable)
            .set({
                dispatchedComputerId: computerId,
                dispatchedPlacementGeneration: row.placementGeneration,
            })
            .where(
                and(
                    eq(reminderAgentAttentionTable.id, command.attentionId),
                    isNull(reminderAgentAttentionTable.dispatchedComputerId)
                )
            )
            .returning({ id: reminderAgentAttentionTable.id });
        if (!claimed) {
            return;
        }
    }
    if (!transport.send(computerId, command) && fresh) {
        await db
            .update(reminderAgentAttentionTable)
            .set({ dispatchedComputerId: null, dispatchedPlacementGeneration: null })
            .where(
                and(
                    eq(reminderAgentAttentionTable.id, command.attentionId),
                    eq(reminderAgentAttentionTable.dispatchedComputerId, computerId)
                )
            );
    }
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

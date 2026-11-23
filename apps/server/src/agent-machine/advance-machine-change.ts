import type { DriveFlushCommand } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { readDeliveryState } from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable } from '../postgres/schema.ts';
import { destinationAllows } from './machine-authority.ts';
import {
    dropPendingChange,
    noteFlushSent,
    type PendingMachineChange,
    readPendingChange,
} from './machine-change-store.ts';

export type MachineChangeStep =
    | { kind: 'idle' }
    | { agentId: string; kind: 'dropped'; serverId: string }
    | { agentId: string; kind: 'waiting'; serverId: string }
    | {
          agentId: string;
          computerId: string;
          frame: DriveFlushCommand;
          kind: 'flush';
          serverId: string;
      }
    | {
          agentId: string;
          from: string;
          kind: 'applied';
          placementGeneration: number;
          serverId: string;
          to: string;
      };

export interface AdvanceInput {
    agentId: string;
    isOnline: (computerId: string) => boolean;
    resendFlush?: boolean;
    serverId: string;
}

export async function advanceMachineChange(tx: HausDatabase, input: AdvanceInput) {
    const change = await readPendingChange(tx, input);
    if (!change) {
        return { kind: 'idle' } satisfies MachineChangeStep;
    }
    const scope = { agentId: input.agentId, serverId: input.serverId };
    const [agent] = await tx
        .select({
            computerId: agentsTable.computerId,
            placementGeneration: agentsTable.placementGeneration,
            retiredAt: agentsTable.retiredAt,
            sessionGeneration: agentsTable.sessionGeneration,
        })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (
        !(agent?.computerId && agent.retiredAt === null) ||
        agent.computerId === change.computerId
    ) {
        await dropPendingChange(tx, scope);
        return { ...scope, kind: 'dropped' } satisfies MachineChangeStep;
    }
    if (!(await stillConsented(tx, change))) {
        await dropPendingChange(tx, scope);
        return { ...scope, kind: 'dropped' } satisfies MachineChangeStep;
    }
    if ((await readDeliveryState(tx, input.agentId))?.activeRunId) {
        return { ...scope, kind: 'waiting' } satisfies MachineChangeStep;
    }
    if (!(change.fromLastSynced || change.flushedAt)) {
        if (!input.isOnline(agent.computerId)) {
            return { ...scope, kind: 'waiting' } satisfies MachineChangeStep;
        }
        if (flushOutstanding(change) && !input.resendFlush) {
            return { ...scope, kind: 'waiting' } satisfies MachineChangeStep;
        }
        const flushId = createOpaqueId('flush');
        await noteFlushSent(tx, { ...scope, flushId });
        return {
            ...scope,
            computerId: agent.computerId,
            frame: {
                agentId: input.agentId,
                flushId,
                placementGeneration: agent.placementGeneration,
                sessionGeneration: agent.sessionGeneration,
                type: 'drive-flush',
            },
            kind: 'flush',
        } satisfies MachineChangeStep;
    }
    return await switchMachine(tx, { ...scope, from: agent.computerId, to: change.computerId });
}

export async function switchMachine(
    tx: HausDatabase,
    input: { agentId: string; from: string; serverId: string; to: string }
) {
    const scope = { agentId: input.agentId, serverId: input.serverId };
    const [moved] = await tx
        .update(agentsTable)
        .set({
            computerId: input.to,
            placementGeneration: sql`${agentsTable.placementGeneration} + 1`,
        })
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .returning({ placementGeneration: agentsTable.placementGeneration });
    if (!moved) {
        throw new Error('The Agent vanished while its Machine changed.');
    }
    await dropPendingChange(tx, scope);
    return {
        ...input,
        kind: 'applied',
        placementGeneration: moved.placementGeneration,
    } satisfies MachineChangeStep;
}

export const flushResendMs = 2 * 60 * 1000;

function flushOutstanding(change: PendingMachineChange) {
    return (
        change.flushId !== null &&
        change.flushSentAt !== null &&
        Date.now() - change.flushSentAt.getTime() < flushResendMs
    );
}

async function stillConsented(tx: HausDatabase, change: PendingMachineChange) {
    return await destinationAllows(tx, {
        agentId: change.agentId,
        computerId: change.computerId,
        serverId: change.serverId,
        userId: change.requestedByUserId,
    });
}

import type { AgentActivityEvent, AgentActivityFrame } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentActivityTable, agentDeliveryTable, agentsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { toAgentActivityEvent } from './agent-activity-history.ts';

const serverProducerId = 'server';

interface AppendActivityInput {
    agentId: string;
    category: AgentActivityFrame['category'];
    occurredAt?: string;
    operationId?: string;
    phase: AgentActivityFrame['phase'];
    producer: 'computer' | 'server';
    producerId: string;
    producerSequence?: number;
    runId: string;
    serverId: string;
    toolRef?: string;
}

/**
 * Appends one row while the caller owns the Server lock. The active-run guard
 * makes stale Computer frames and post-settlement retries no-ops.
 */
export async function appendAgentActivity(
    tx: HausDatabase,
    input: AppendActivityInput
): Promise<AgentActivityEvent | null> {
    const [active] = await tx
        .select({ activeRunId: agentDeliveryTable.activeRunId })
        .from(agentDeliveryTable)
        .where(
            and(
                eq(agentDeliveryTable.agentId, input.agentId),
                eq(agentDeliveryTable.serverId, input.serverId)
            )
        )
        .limit(1);
    if (active?.activeRunId !== input.runId) {
        return null;
    }

    const identity = [
        eq(agentActivityTable.serverId, input.serverId),
        eq(agentActivityTable.agentId, input.agentId),
        eq(agentActivityTable.runId, input.runId),
        eq(agentActivityTable.producer, input.producer),
        eq(agentActivityTable.producerId, input.producerId),
    ];
    if (input.producerSequence !== undefined) {
        identity.push(eq(agentActivityTable.producerSequence, input.producerSequence));
        const [existing] = await tx
            .select()
            .from(agentActivityTable)
            .where(and(...identity))
            .limit(1);
        if (existing) {
            return toAgentActivityEvent(existing);
        }
    }

    const [run] = await tx
        .select({ runOrder: agentActivityTable.runOrder })
        .from(agentActivityTable)
        .where(
            and(
                eq(agentActivityTable.serverId, input.serverId),
                eq(agentActivityTable.agentId, input.agentId),
                eq(agentActivityTable.runId, input.runId)
            )
        )
        .limit(1);
    let runOrder = run?.runOrder;
    if (runOrder === undefined) {
        const [runOrderRow] = await tx
            .select({ value: sql<number>`coalesce(max(${agentActivityTable.runOrder}), 0)` })
            .from(agentActivityTable)
            .where(
                and(
                    eq(agentActivityTable.serverId, input.serverId),
                    eq(agentActivityTable.agentId, input.agentId)
                )
            );
        runOrder = Number(runOrderRow?.value ?? 0) + 1;
    }

    const [producerSequenceRow] = await tx
        .select({ value: sql<number>`coalesce(max(${agentActivityTable.producerSequence}), 0)` })
        .from(agentActivityTable)
        .where(and(...identity.slice(0, 5)));
    const producerSequence = input.producerSequence ?? Number(producerSequenceRow?.value ?? 0) + 1;

    const [positionRow] = await tx
        .select({ value: sql<number>`coalesce(max(${agentActivityTable.position}), 0)` })
        .from(agentActivityTable)
        .where(
            and(
                eq(agentActivityTable.serverId, input.serverId),
                eq(agentActivityTable.agentId, input.agentId),
                eq(agentActivityTable.runId, input.runId)
            )
        );
    const position = Number(positionRow?.value ?? 0) + 1;
    const [row] = await tx
        .insert(agentActivityTable)
        .values({
            agentId: input.agentId,
            category: input.category,
            id: createOpaqueId('aev'),
            occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
            ...(input.operationId ? { operationId: input.operationId } : {}),
            phase: input.phase,
            position,
            producer: input.producer,
            producerId: input.producerId,
            producerSequence,
            runId: input.runId,
            runOrder,
            serverId: input.serverId,
            ...(input.toolRef ? { toolRef: input.toolRef } : {}),
        })
        .returning();

    return row ? toAgentActivityEvent(row) : null;
}

export async function recordComputerAgentActivity(
    db: HausDatabase,
    input: {
        computerId: string;
        frame: AgentActivityFrame;
        serverId: string;
    }
): Promise<AgentActivityEvent | null> {
    const result = await recordComputerAgentActivityWithStatus(db, input);
    return result?.event ?? null;
}

export async function recordComputerAgentActivityWithStatus(
    db: HausDatabase,
    input: {
        computerId: string;
        frame: AgentActivityFrame;
        serverId: string;
    }
): Promise<{ event: AgentActivityEvent; inserted: boolean } | null> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [agent] = await tx
            .select({ computerId: agentsTable.computerId })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.id, input.frame.agentId),
                    eq(agentsTable.computerId, input.computerId)
                )
            )
            .limit(1);
        if (!agent) {
            return null;
        }
        const [delivery] = await tx
            .select({
                acceptedAt: agentDeliveryTable.acceptedAt,
                activeRunComputerId: agentDeliveryTable.activeRunComputerId,
                activeRunId: agentDeliveryTable.activeRunId,
            })
            .from(agentDeliveryTable)
            .where(eq(agentDeliveryTable.agentId, input.frame.agentId))
            .limit(1);
        if (
            delivery?.activeRunComputerId !== input.computerId ||
            delivery.activeRunId !== input.frame.runId ||
            delivery.acceptedAt === null
        ) {
            return null;
        }
        const [existing] = await tx
            .select()
            .from(agentActivityTable)
            .where(
                and(
                    eq(agentActivityTable.serverId, input.serverId),
                    eq(agentActivityTable.agentId, input.frame.agentId),
                    eq(agentActivityTable.runId, input.frame.runId),
                    eq(agentActivityTable.producer, 'computer'),
                    eq(agentActivityTable.producerId, input.computerId),
                    eq(agentActivityTable.producerSequence, input.frame.producerSequence)
                )
            )
            .limit(1);
        if (existing) {
            return { event: toAgentActivityEvent(existing), inserted: false };
        }
        const event = await appendAgentActivity(tx, {
            agentId: input.frame.agentId,
            category: input.frame.category,
            occurredAt: input.frame.occurredAt,
            operationId: input.frame.operationId,
            phase: input.frame.phase,
            producer: 'computer',
            producerId: input.computerId,
            producerSequence: input.frame.producerSequence,
            runId: input.frame.runId,
            serverId: input.serverId,
            toolRef: input.frame.toolRef,
        });
        return event ? { event, inserted: true } : null;
    });
}

export async function appendServerAgentActivity(
    tx: HausDatabase,
    input: {
        agentId: string;
        category: AppendActivityInput['category'];
        phase: AppendActivityInput['phase'];
        runId: string;
        serverId: string;
        toolRef?: string;
    }
) {
    return await appendAgentActivity(tx, {
        ...input,
        producer: 'server',
        producerId: serverProducerId,
    });
}

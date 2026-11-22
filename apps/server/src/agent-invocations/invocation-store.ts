import type {
    DesktopRefusal,
    InvocationOperationKind,
    InvocationRequestFrame,
    InvokeResult,
} from '@haus/api';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentInvocationsTable, agentsTable } from '../postgres/schema.ts';

export type InvocationRecord = typeof agentInvocationsTable.$inferSelect;

export type ResultSettlement =
    | { kind: 'finished'; record: InvocationRecord }
    | { kind: 'late' }
    | { kind: 'stale' };

const openStates = ['sent', 'accepted'] as const;

export async function readAgentMachine(db: HausDatabase, agentId: string) {
    const [agent] = await db
        .select({ computerId: agentsTable.computerId, serverId: agentsTable.serverId })
        .from(agentsTable)
        .where(eq(agentsTable.id, agentId))
        .limit(1);
    return agent ?? null;
}

export async function recordInvocation(
    db: HausDatabase,
    input: {
        computerId: string | null;
        frame: InvocationRequestFrame;
        offline: boolean;
        operationKind: InvocationOperationKind;
        serverId: string;
        timeoutMs: number;
    }
) {
    const now = new Date();
    const { frame } = input;
    const [created] = await db
        .insert(agentInvocationsTable)
        .values({
            agentId: frame.agentId,
            computerId: input.computerId,
            id: createOpaqueId('inv'),
            operationKind: input.operationKind,
            requestedAt: now,
            runId: frame.runId,
            seq: frame.seq,
            serverId: input.serverId,
            timeoutMs: input.timeoutMs,
            toolCallId: frame.toolCallId,
            ...(input.offline
                ? { finishedAt: now, outcome: 'offline' as const, state: 'finished' as const }
                : { state: 'sent' as const }),
        })
        .onConflictDoNothing()
        .returning();
    if (created) {
        return { created: true, record: created };
    }
    const [existing] = await db
        .select()
        .from(agentInvocationsTable)
        .where(
            and(
                eq(agentInvocationsTable.serverId, input.serverId),
                eq(agentInvocationsTable.agentId, frame.agentId),
                eq(agentInvocationsTable.runId, frame.runId),
                eq(agentInvocationsTable.toolCallId, frame.toolCallId),
                eq(agentInvocationsTable.seq, frame.seq)
            )
        )
        .limit(1);
    if (!existing) {
        throw new Error('The invocation record vanished between insert and read.');
    }
    return { created: false, record: existing };
}

export async function recordSendFailure(db: HausDatabase, invocationId: string) {
    await db
        .update(agentInvocationsTable)
        .set({ finishedAt: new Date(), outcome: 'offline', state: 'finished' })
        .where(
            and(eq(agentInvocationsTable.id, invocationId), eq(agentInvocationsTable.state, 'sent'))
        );
}

export async function recordDesktopRefusal(
    db: HausDatabase,
    invocationId: string,
    refusal: DesktopRefusal
) {
    const [refused] = await db
        .update(agentInvocationsTable)
        .set({
            finishedAt: sql`coalesce(${agentInvocationsTable.finishedAt}, now())`,
            outcome: sql`case when ${agentInvocationsTable.state} = 'sent' then 'failed' else ${agentInvocationsTable.outcome} end`,
            refusal,
            state: 'finished',
        })
        .where(
            and(
                eq(agentInvocationsTable.id, invocationId),
                isNull(agentInvocationsTable.refusal),
                or(
                    eq(agentInvocationsTable.state, 'sent'),
                    and(
                        eq(agentInvocationsTable.state, 'finished'),
                        eq(agentInvocationsTable.outcome, 'offline')
                    )
                )
            )
        )
        .returning({ outcome: agentInvocationsTable.outcome });
    return refused?.outcome === 'failed' || refused?.outcome === 'offline' ? refused.outcome : null;
}

export async function recordScreenRefusal(
    db: HausDatabase,
    invocationId: string,
    refusal: DesktopRefusal
) {
    await db
        .update(agentInvocationsTable)
        .set({ refusal })
        .where(
            and(
                eq(agentInvocationsTable.id, invocationId),
                eq(agentInvocationsTable.state, 'finished')
            )
        );
}

export async function readOpenDesktopCommands(
    db: HausDatabase,
    input: { computerId: string; serverId: string }
) {
    return await db
        .select({
            agentId: agentInvocationsTable.agentId,
            invocationId: agentInvocationsTable.id,
            since: agentInvocationsTable.requestedAt,
        })
        .from(agentInvocationsTable)
        .where(
            and(
                eq(agentInvocationsTable.serverId, input.serverId),
                eq(agentInvocationsTable.computerId, input.computerId),
                eq(agentInvocationsTable.operationKind, 'desktop'),
                inArray(agentInvocationsTable.state, openStates)
            )
        )
        .orderBy(asc(agentInvocationsTable.requestedAt));
}

export async function recordAccepted(db: HausDatabase, invocationId: string, computerId: string) {
    await db
        .update(agentInvocationsTable)
        .set({ acceptedAt: new Date(), state: 'accepted' })
        .where(
            and(
                eq(agentInvocationsTable.id, invocationId),
                eq(agentInvocationsTable.computerId, computerId),
                eq(agentInvocationsTable.state, 'sent')
            )
        );
}

export async function recordResult(db: HausDatabase, computerId: string, result: InvokeResult) {
    const now = new Date();
    const unknown = result.outcome === 'unknown';
    const [finished] = await db
        .update(agentInvocationsTable)
        .set({
            exitCode: result.exitCode ?? null,
            finishedAt: now,
            outcome: result.outcome,
            state: unknown ? 'unknown' : 'finished',
        })
        .where(
            and(
                eq(agentInvocationsTable.id, result.invocationId),
                eq(agentInvocationsTable.computerId, computerId),
                inArray(agentInvocationsTable.state, openStates)
            )
        )
        .returning();
    if (finished) {
        return { kind: 'finished', record: finished } satisfies ResultSettlement;
    }
    const [late] = await db
        .update(agentInvocationsTable)
        .set({
            lateExitCode: result.exitCode ?? null,
            lateOutcome: result.outcome,
            lateResultAt: now,
        })
        .where(
            and(
                eq(agentInvocationsTable.id, result.invocationId),
                eq(agentInvocationsTable.computerId, computerId),
                eq(agentInvocationsTable.state, 'unknown'),
                isNull(agentInvocationsTable.lateOutcome)
            )
        )
        .returning({ id: agentInvocationsTable.id });
    const settlement: ResultSettlement = late ? { kind: 'late' } : { kind: 'stale' };
    return settlement;
}

export async function recordUnknown(db: HausDatabase, invocationId: string) {
    const [record] = await db
        .update(agentInvocationsTable)
        .set({ finishedAt: new Date(), outcome: 'unknown', state: 'unknown' })
        .where(
            and(
                eq(agentInvocationsTable.id, invocationId),
                inArray(agentInvocationsTable.state, openStates)
            )
        )
        .returning();
    return record ?? null;
}

export async function recordOpenInvocationsUnknown(db: HausDatabase) {
    await db
        .update(agentInvocationsTable)
        .set({ finishedAt: new Date(), outcome: 'unknown', state: 'unknown' })
        .where(inArray(agentInvocationsTable.state, openStates));
}

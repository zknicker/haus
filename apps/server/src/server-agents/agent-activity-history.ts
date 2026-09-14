import type {
    AgentActiveActivitySnapshot,
    AgentActivityEvent,
    AgentActivityHistoryInput,
    AgentActivityHistoryPage,
    AgentCurrentActivity,
} from '@haus/api';
import { projectAgentCurrentActivity } from '@haus/api/agent-activity';
import { and, asc, desc, eq, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentActivityTable,
    agentDeliveryTable,
    agentsTable,
    computersTable,
} from '../postgres/schema.ts';

export async function listAgentActivityHistory(
    db: HausDatabase,
    input: AgentActivityHistoryInput
): Promise<AgentActivityHistoryPage> {
    const predicates = [
        eq(agentActivityTable.serverId, input.serverId),
        eq(agentActivityTable.agentId, input.agentId),
    ];
    if (input.runId) {
        predicates.push(eq(agentActivityTable.runId, input.runId));
    }
    if (input.before) {
        let beforeRunOrder: number | undefined;
        if (!input.runId) {
            const [cursorRun] = await db
                .select({ runOrder: agentActivityTable.runOrder })
                .from(agentActivityTable)
                .where(
                    and(
                        eq(agentActivityTable.serverId, input.serverId),
                        eq(agentActivityTable.agentId, input.agentId),
                        eq(agentActivityTable.runId, input.before.runId)
                    )
                )
                .limit(1);
            beforeRunOrder = cursorRun?.runOrder;
        }
        predicates.push(
            input.runId
                ? lt(agentActivityTable.position, input.before.position)
                : beforeRunOrder === undefined
                  ? sql`false`
                  : or(
                        lt(agentActivityTable.runOrder, beforeRunOrder),
                        and(
                            eq(agentActivityTable.runOrder, beforeRunOrder),
                            lt(agentActivityTable.position, input.before.position)
                        )
                    )!
        );
    }
    const rows = await db
        .select()
        .from(agentActivityTable)
        .where(and(...predicates))
        .orderBy(desc(agentActivityTable.runOrder), desc(agentActivityTable.position))
        .limit(input.limit + 1);
    const pageRows = rows.slice(0, input.limit);
    const last = pageRows.at(-1);
    return {
        events: pageRows.map(toAgentActivityEvent),
        nextBefore:
            rows.length > input.limit && last
                ? { position: last.position, runId: last.runId }
                : null,
    };
}

export async function readActiveAgentActivity(
    db: HausDatabase,
    serverId: string
): Promise<AgentActiveActivitySnapshot> {
    const rows = await db
        .select({ activity: agentActivityTable })
        .from(agentActivityTable)
        .innerJoin(
            agentDeliveryTable,
            and(
                eq(agentDeliveryTable.serverId, agentActivityTable.serverId),
                eq(agentDeliveryTable.agentId, agentActivityTable.agentId),
                eq(agentDeliveryTable.activeRunId, agentActivityTable.runId),
                isNotNull(agentDeliveryTable.acceptedAt)
            )
        )
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentActivityTable.serverId),
                eq(agentsTable.id, agentActivityTable.agentId)
            )
        )
        .innerJoin(
            computersTable,
            and(
                eq(computersTable.serverId, agentsTable.serverId),
                eq(computersTable.id, agentsTable.computerId)
            )
        )
        .where(and(eq(agentActivityTable.serverId, serverId), eq(computersTable.health, 'healthy')))
        // `runOrder` is Agent-local for history pagination. The first recorded
        // event is the only cross-Agent turn-start ordering fact available to
        // this projection, so preserve each run's first-seen position while
        // projecting its complete semantic sequence.
        .orderBy(asc(agentActivityTable.recordedAt), asc(agentActivityTable.id));
    const eventsByRun = new Map<string, AgentActivityEvent[]>();
    for (const { activity } of rows) {
        const key = `${activity.agentId}:${activity.runId}`;
        const events = eventsByRun.get(key) ?? [];
        events.push(toAgentActivityEvent(activity));
        eventsByRun.set(key, events);
    }
    const activities = [...eventsByRun.values()].flatMap((events) => {
        const current = [...events]
            .sort((left, right) => left.position - right.position)
            .reduce<AgentCurrentActivity | null>(projectAgentCurrentActivity, null);
        return current ? [current] : [];
    });
    return { activities };
}

export function toAgentActivityEvent(
    row: typeof agentActivityTable.$inferSelect
): AgentActivityEvent {
    return {
        agentId: row.agentId,
        category: row.category,
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        phase: row.phase,
        position: row.position,
        producer: row.producer,
        producerId: row.producerId,
        producerSequence: row.producerSequence,
        runId: row.runId,
        serverId: row.serverId,
        ...(row.toolRef ? { toolRef: row.toolRef } : {}),
    };
}

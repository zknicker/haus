import {
    CREW_LIFECYCLE_LIMIT,
    type TaskCrewLifecycle,
    type TaskCrewLifecycleInput,
} from '@haus/api';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentTurnsTable, tasksTable } from '../postgres/schema.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function readCrewLifecycle(
    db: Reader,
    actor: TaskActor,
    input: TaskCrewLifecycleInput
) {
    await requireTaskActor(db, input.serverId, actor);
    const crew = and(
        eq(tasksTable.serverId, input.serverId),
        eq(tasksTable.captainId, input.captainId)
    );
    const turns = await db
        .select({
            endedAt: agentTurnsTable.endedAt,
            shortId: tasksTable.shortId,
            startedAt: agentTurnsTable.startedAt,
            status: agentTurnsTable.status,
            taskId: tasksTable.id,
            title: tasksTable.title,
        })
        .from(agentTurnsTable)
        .innerJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, agentTurnsTable.serverId),
                eq(tasksTable.agentId, agentTurnsTable.agentId)
            )
        )
        .where(and(crew, inArray(agentTurnsTable.status, ['completed', 'failed'])))
        .orderBy(desc(agentTurnsTable.endedAt))
        .limit(CREW_LIFECYCLE_LIMIT);
    const archives = await db
        .select({
            archivedAt: tasksTable.archivedAt,
            shortId: tasksTable.shortId,
            taskId: tasksTable.id,
            title: tasksTable.title,
        })
        .from(tasksTable)
        .where(and(crew, isNotNull(tasksTable.archivedAt)))
        .orderBy(desc(tasksTable.archivedAt))
        .limit(CREW_LIFECYCLE_LIMIT);
    return {
        archives: archives.flatMap((task) =>
            task.archivedAt ? [{ ...task, archivedAt: task.archivedAt.toISOString() }] : []
        ),
        turns: turns.map((turn) => ({
            ...turn,
            endedAt: turn.endedAt.toISOString(),
            startedAt: turn.startedAt.toISOString(),
            status: turn.status === 'failed' ? ('failed' as const) : ('completed' as const),
        })),
    } satisfies TaskCrewLifecycle;
}

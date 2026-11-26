import type { AgentIssueActor, IssueActor } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serverMembershipsTable, tasksTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function nameIssueActors(
    db: Reader,
    serverId: string,
    actors: readonly (IssueActor | null)[]
) {
    const present = actors.filter((actor) => actor !== null);
    const userIds = idsOf(present, 'user');
    const agentIds = idsOf(present, 'captain');
    const taskIds = idsOf(present, 'task');
    const users =
        userIds.length === 0
            ? []
            : await db
                  .select({ handle: serverMembershipsTable.handle, id: serverMembershipsTable.userId })
                  .from(serverMembershipsTable)
                  .where(
                      and(
                          eq(serverMembershipsTable.serverId, serverId),
                          inArray(serverMembershipsTable.userId, userIds)
                      )
                  );
    const agents =
        agentIds.length === 0
            ? []
            : await db
                  .select({ handle: agentsTable.handle, id: agentsTable.id })
                  .from(agentsTable)
                  .where(and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, agentIds)));
    const tasks =
        taskIds.length === 0
            ? []
            : await db
                  .select({ id: tasksTable.id, title: tasksTable.title })
                  .from(tasksTable)
                  .where(and(eq(tasksTable.serverId, serverId), inArray(tasksTable.id, taskIds)));
    const handles = new Map([...users, ...agents].map((row) => [row.id, row.handle]));
    const titles = new Map(tasks.map((row) => [row.id, row.title]));
    return (actor: IssueActor): AgentIssueActor => {
        switch (actor.kind) {
            case 'user':
                return { handle: handles.get(actor.userId) ?? null, kind: 'user' };
            case 'captain':
                return { handle: handles.get(actor.agentId) ?? null, kind: 'captain' };
            case 'task':
                return { kind: 'task', taskId: actor.taskId, title: titles.get(actor.taskId) ?? '' };
        }
    };
}

export function issueActorLabel(actor: AgentIssueActor | null) {
    if (actor === null) {
        return 'nobody';
    }
    if (actor.kind === 'task') {
        return `task:${actor.taskId}`;
    }
    if (actor.handle) {
        return `@${actor.handle}`;
    }
    return actor.kind === 'captain' ? 'a Captain with no handle' : 'a person with no handle';
}

function idsOf(actors: readonly IssueActor[], kind: IssueActor['kind']) {
    return [
        ...new Set(
            actors.flatMap((actor) => {
                if (actor.kind !== kind) {
                    return [];
                }
                if (actor.kind === 'user') {
                    return [actor.userId];
                }
                return actor.kind === 'captain' ? [actor.agentId] : [actor.taskId];
            })
        ),
    ];
}

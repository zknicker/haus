import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable, projectsTable } from '../postgres/schema.ts';

export async function isLiveProject(
    db: Pick<HausDatabase, 'select'>,
    input: { projectId: string; serverId: string }
) {
    const [project] = await db
        .select({ id: projectsTable.chatId })
        .from(projectsTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, projectsTable.serverId),
                eq(chatsTable.id, projectsTable.chatId)
            )
        )
        .where(
            and(
                eq(projectsTable.serverId, input.serverId),
                eq(projectsTable.chatId, input.projectId),
                isNull(chatsTable.archivedAt),
                isNull(chatsTable.deletedAt),
                eq(chatsTable.isAll, false)
            )
        )
        .limit(1);
    return project !== undefined;
}

export async function findLiveAgentHome(
    db: Pick<HausDatabase, 'select'>,
    input: { agentId: string; serverId: string }
) {
    const [agent] = await db
        .select({ homeProjectId: agentsTable.homeProjectId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (!agent?.homeProjectId) {
        return null;
    }
    const live = await isLiveProject(db, {
        projectId: agent.homeProjectId,
        serverId: input.serverId,
    });
    return live ? agent.homeProjectId : null;
}

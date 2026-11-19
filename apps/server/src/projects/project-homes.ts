import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { ProjectHasAgentsError } from './project-errors.ts';

export async function refuseProjectWithHomeAgents(
    db: Pick<HausDatabase, 'select'>,
    input: { chatId: string; serverId: string }
) {
    const agents = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.homeProjectId, input.chatId),
                isNull(agentsTable.retiredAt)
            )
        )
        .orderBy(asc(agentsTable.handle));
    if (agents.length > 0) {
        throw new ProjectHasAgentsError(agents.map(({ handle }) => handle));
    }
}

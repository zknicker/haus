import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, projectsTable } from '../postgres/schema.ts';

export async function requireHausProjectId(db: Pick<HausDatabase, 'select'>, serverId: string) {
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
        .where(and(eq(projectsTable.serverId, serverId), eq(chatsTable.isAll, true)))
        .limit(1);
    if (!project) {
        throw new Error(`Server ${serverId} has no Haus project.`);
    }
    return project.id;
}

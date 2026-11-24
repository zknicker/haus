import { and, eq } from 'drizzle-orm';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { type DriveSeedCreator, seedDriveFile } from '../drive/seed-file.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, projectsTable, taskKeysTable } from '../postgres/schema.ts';

export function projectRulesPath(key: string) {
    return `projects/${key}/AGENTS.md`;
}

export async function seedProjectRules(
    db: HausDatabase,
    storage: ArtifactStorage,
    project: { creator: DriveSeedCreator; projectId: string; serverId: string }
) {
    const [row] = await db
        .select({ key: taskKeysTable.key, name: chatsTable.name })
        .from(projectsTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, projectsTable.serverId),
                eq(chatsTable.id, projectsTable.chatId)
            )
        )
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .where(
            and(
                eq(projectsTable.serverId, project.serverId),
                eq(projectsTable.chatId, project.projectId)
            )
        )
        .limit(1);
    if (!row) {
        return 'missing' as const;
    }
    return await seedDriveFile(db, storage, {
        creator: project.creator,
        path: projectRulesPath(row.key),
        serverId: project.serverId,
        text: `# ${row.name ?? row.key} rules\n`,
    });
}

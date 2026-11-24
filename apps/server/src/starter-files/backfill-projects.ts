import { and, eq, isNull } from 'drizzle-orm';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, projectsTable, taskKeysTable } from '../postgres/schema.ts';
import { projectRulesPath, seedProjectRules } from '../projects/project-rules.ts';

export async function backfillProjectRules(
    db: HausDatabase,
    storage: ArtifactStorage,
    scope: {
        closing: AbortSignal;
        isHeld(serverId: string, path: string): boolean;
        owners: ReadonlyMap<string, string>;
        settle(work: Promise<unknown>): Promise<unknown>;
    }
) {
    for (const project of await liveProjects(db)) {
        if (scope.closing.aborted) {
            return;
        }
        const userId = scope.owners.get(project.serverId);
        if (userId && !scope.isHeld(project.serverId, projectRulesPath(project.key))) {
            await scope.settle(
                seedProjectRules(db, storage, {
                    creator: { agentId: null, userId },
                    projectId: project.projectId,
                    serverId: project.serverId,
                    unless: 'ever-held',
                })
            );
        }
    }
}

async function liveProjects(db: HausDatabase) {
    return await db
        .select({
            key: taskKeysTable.key,
            projectId: projectsTable.chatId,
            serverId: projectsTable.serverId,
        })
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
        .where(and(isNull(chatsTable.archivedAt), isNull(chatsTable.deletedAt)));
}

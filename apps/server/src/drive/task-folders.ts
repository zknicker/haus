import { artifactPathKey } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ArtifactAccess } from '../artifacts/access.ts';
import { ArtifactError } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, projectsTable, taskKeysTable, tasksTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

/**
 * The folders a Task agent writes (specs/tasks.md#drive): a crew Task's reports, renders and
 * handoffs under its Captain's area, or a person's Task's own folder in its Project. Null when
 * the writer is not a Task agent.
 */
export async function readTaskDriveFolders(
    db: Reader,
    access: Pick<ArtifactAccess, 'agentId' | 'serverId'>
) {
    if (!access.agentId) {
        return null;
    }
    const captain = alias(agentsTable, 'captain');
    const [task] = await db
        .select({
            captainHandle: captain.handle,
            id: tasksTable.id,
            projectKey: taskKeysTable.key,
            shortId: tasksTable.shortId,
        })
        .from(tasksTable)
        .leftJoin(
            captain,
            and(eq(captain.serverId, tasksTable.serverId), eq(captain.id, tasksTable.captainId))
        )
        .leftJoin(
            projectsTable,
            and(
                eq(projectsTable.serverId, tasksTable.serverId),
                eq(projectsTable.chatId, tasksTable.projectId)
            )
        )
        .leftJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .where(
            and(eq(tasksTable.serverId, access.serverId), eq(tasksTable.agentId, access.agentId))
        )
        .limit(1);
    if (!task) {
        return null;
    }
    const folders = task.captainHandle
        ? ['reports', 'renders', 'handoffs'].map(
              (kind) => `agents/${task.captainHandle}/${kind}/${task.shortId}`
          )
        : [`projects/${task.projectKey}/tasks/${task.shortId}`];
    return { folders, taskId: task.id };
}

export function requireTaskDriveFolder(folders: readonly string[], path: string) {
    const key = artifactPathKey(path);
    if (folders.some((folder) => key.startsWith(`${artifactPathKey(folder)}/`))) {
        return;
    }
    throw new ArtifactError(
        `A Task writes Drive only under its own folders: ${folders.map((folder) => `\`${folder}/\``).join(', ')}.`,
        403,
        'DRIVE_WRITE_OUTSIDE_TASK'
    );
}

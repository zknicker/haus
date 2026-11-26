import { artifactPathKey } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ArtifactAccess } from '../artifacts/access.ts';
import { ArtifactError } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, projectsTable, taskKeysTable, tasksTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

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
    return { folders: taskDriveFolders(task), taskId: task.id };
}

export function taskDriveFolders(task: {
    captainHandle: string | null;
    projectKey: string | null;
    shortId: string;
}) {
    return task.captainHandle
        ? ['reports', 'renders', 'handoffs'].map(
              (kind) => `agents/${task.captainHandle}/${kind}/${task.shortId}`
          )
        : [`projects/${task.projectKey}/tasks/${task.shortId}`];
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

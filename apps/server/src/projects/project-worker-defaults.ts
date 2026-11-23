import type { ProjectSetDefaultWorkerPlaceInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { projectsTable } from '../postgres/schema.ts';
import { projectUpdatedTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readComputerPlace } from '../workers/computer-places.ts';
import { ProjectNotFoundError, ProjectRefusalError } from './project-errors.ts';

export async function clearComputerDefaults(
    tx: HausDatabase,
    serverId: string,
    computerId: string
) {
    const cleared = await tx
        .update(projectsTable)
        .set({ defaultWorkerComputerId: null, defaultWorkerPlace: null })
        .where(
            and(
                eq(projectsTable.serverId, serverId),
                eq(projectsTable.defaultWorkerComputerId, computerId)
            )
        )
        .returning({ projectId: projectsTable.chatId });
    return cleared.map(({ projectId }) => projectId);
}

export async function setProjectDefaultWorkerPlace(
    db: HausDatabase,
    member: HausUser | null,
    input: ProjectSetDefaultWorkerPlaceInput
) {
    const { place } = input;
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireChatWriteAccess(tx, member, {
            chatId: input.projectId,
            serverId: input.serverId,
        });
        if (place?.kind === 'computer') {
            const computer = await readComputerPlace(tx, input.serverId, place.computerId);
            if (!computer) {
                throw new ProjectNotFoundError('That Computer does not exist.');
            }
            if (!computer.workersEnabled) {
                throw new ProjectRefusalError(
                    'WORKER_PLACE_OFF',
                    'Turn on "Run Workers here" for that Computer before making it the default.'
                );
            }
        }
        const updated = await tx
            .update(projectsTable)
            .set({
                defaultWorkerComputerId: place?.kind === 'computer' ? place.computerId : null,
                defaultWorkerPlace: place?.kind ?? null,
            })
            .where(
                and(
                    eq(projectsTable.serverId, input.serverId),
                    eq(projectsTable.chatId, input.projectId)
                )
            )
            .returning({ projectId: projectsTable.chatId });
        if (updated.length === 0) {
            throw new ProjectNotFoundError('That Project does not exist.');
        }
    });
    projectUpdatedTopic.announce({ projectId: input.projectId, serverId: input.serverId });
    return { place };
}

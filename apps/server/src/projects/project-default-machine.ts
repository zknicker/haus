import type { ProjectSetDefaultMachineInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, projectsTable } from '../postgres/schema.ts';
import { projectUpdatedTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ProjectNotFoundError } from './project-errors.ts';

/** Clears every Project default that names a Computer being removed, in its transaction. */
export async function clearComputerDefaults(
    tx: HausDatabase,
    serverId: string,
    computerId: string
) {
    const cleared = await tx
        .update(projectsTable)
        .set({ defaultTaskComputerId: null })
        .where(
            and(
                eq(projectsTable.serverId, serverId),
                eq(projectsTable.defaultTaskComputerId, computerId)
            )
        )
        .returning({ projectId: projectsTable.chatId });
    return cleared.map(({ projectId }) => projectId);
}

/** `project.setDefaultMachine`: the Machine a Task started in this Project runs on by default. */
export async function setProjectDefaultMachine(
    db: HausDatabase,
    member: HausUser | null,
    input: ProjectSetDefaultMachineInput
) {
    const { computerId } = input;
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireChatWriteAccess(tx, member, {
            chatId: input.projectId,
            serverId: input.serverId,
        });
        if (computerId !== null) {
            const [computer] = await tx
                .select({ id: computersTable.id })
                .from(computersTable)
                .where(
                    and(
                        eq(computersTable.serverId, input.serverId),
                        eq(computersTable.id, computerId)
                    )
                )
                .limit(1);
            if (!computer) {
                throw new ProjectNotFoundError('That Machine is not attached to this Server.');
            }
        }
        const updated = await tx
            .update(projectsTable)
            .set({ defaultTaskComputerId: computerId })
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
    return { computerId };
}

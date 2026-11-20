import type {
    ProjectAddRepoInput,
    ProjectLinkRepoInput,
    ProjectRemoveRepoInput,
    ProjectUnlinkRepoInput,
} from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import { requireComputerSteward } from '../computers/computer-steward.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { projectRepoLinksTable, projectReposTable } from '../postgres/schema.ts';
import { projectUpdatedTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ProjectNotFoundError } from './project-errors.ts';

export async function addProjectRepo(
    db: HausDatabase,
    member: HausUser | null,
    input: ProjectAddRepoInput
) {
    const repo = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireChatWriteAccess(tx, member, {
            chatId: input.projectId,
            serverId: input.serverId,
        });
        const [existing] = await tx
            .select({ id: projectReposTable.id, repository: projectReposTable.repository })
            .from(projectReposTable)
            .where(
                and(
                    eq(projectReposTable.serverId, input.serverId),
                    eq(projectReposTable.projectId, input.projectId),
                    sql`lower(${projectReposTable.repository}) = lower(${input.repository})`
                )
            )
            .limit(1);
        if (existing) {
            return existing;
        }
        const id = createOpaqueId('prp');
        await tx.insert(projectReposTable).values({
            id,
            projectId: input.projectId,
            repository: input.repository,
            serverId: input.serverId,
        });
        return { id, repository: input.repository };
    });
    projectUpdatedTopic.announce({ projectId: input.projectId, serverId: input.serverId });
    return { projectRepoId: repo.id, repository: repo.repository };
}

export async function removeProjectRepo(
    db: HausDatabase,
    member: HausUser | null,
    input: ProjectRemoveRepoInput
) {
    const projectId = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const repo = await requireRepoAccess(tx, member, input);
        await tx
            .delete(projectReposTable)
            .where(
                and(
                    eq(projectReposTable.serverId, input.serverId),
                    eq(projectReposTable.id, repo.id)
                )
            );
        return repo.projectId;
    });
    projectUpdatedTopic.announce({ projectId, serverId: input.serverId });
    return { projectRepoId: input.projectRepoId };
}

export async function linkProjectRepo(
    db: HausDatabase,
    member: HausUser | null,
    input: ProjectLinkRepoInput
) {
    const projectId = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const repo = await requireRepoAccess(tx, member, input);
        const steward = await requireComputerSteward(tx, member, input);
        await tx
            .insert(projectRepoLinksTable)
            .values({
                checkoutPath: input.checkoutPath,
                computerId: input.computerId,
                linkedByUserId: steward.stewardUserId,
                projectRepoId: repo.id,
                serverId: input.serverId,
            })
            .onConflictDoUpdate({
                set: { checkoutPath: input.checkoutPath },
                target: [projectRepoLinksTable.projectRepoId, projectRepoLinksTable.computerId],
            });
        return repo.projectId;
    });
    projectUpdatedTopic.announce({ projectId, serverId: input.serverId });
    return { computerId: input.computerId, projectRepoId: input.projectRepoId };
}

export async function unlinkProjectRepo(
    db: HausDatabase,
    member: HausUser | null,
    input: ProjectUnlinkRepoInput
) {
    const projectId = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const repo = await requireRepoAccess(tx, member, input);
        await requireComputerSteward(tx, member, input);
        await tx
            .delete(projectRepoLinksTable)
            .where(
                and(
                    eq(projectRepoLinksTable.serverId, input.serverId),
                    eq(projectRepoLinksTable.projectRepoId, repo.id),
                    eq(projectRepoLinksTable.computerId, input.computerId)
                )
            );
        return repo.projectId;
    });
    projectUpdatedTopic.announce({ projectId, serverId: input.serverId });
    return { computerId: input.computerId, projectRepoId: input.projectRepoId };
}

async function requireRepoAccess(
    tx: HausDatabase,
    member: HausUser | null,
    input: { projectRepoId: string; serverId: string }
) {
    const [repo] = await tx
        .select({ id: projectReposTable.id, projectId: projectReposTable.projectId })
        .from(projectReposTable)
        .where(
            and(
                eq(projectReposTable.serverId, input.serverId),
                eq(projectReposTable.id, input.projectRepoId)
            )
        )
        .limit(1);
    if (!repo) {
        throw new ProjectNotFoundError('That Project repo does not exist.');
    }
    await requireChatWriteAccess(tx, member, { chatId: repo.projectId, serverId: input.serverId });
    return repo;
}

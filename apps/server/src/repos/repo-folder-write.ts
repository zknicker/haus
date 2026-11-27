import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { repoFoldersTable, reposTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { RepoFolderRefusalError } from './repo-errors.ts';
import { readRepoFolder } from './repo-folder-read.ts';

interface FolderInput {
    computerId: string;
    path: string;
    repository: string;
    serverId: string;
}

export async function upsertRepo(
    db: Pick<HausDatabase, 'insert'>,
    input: { repository: string; serverId: string }
) {
    await db
        .insert(reposTable)
        .values({ repository: input.repository.toLowerCase(), serverId: input.serverId })
        .onConflictDoNothing();
}

export async function addRepoFolder(
    db: HausDatabase,
    input: FolderInput & { addedByUserId: string; computerName: string }
) {
    const repository = input.repository.toLowerCase();
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const existing = await readRepoFolder(tx, { ...input, repository });
        if (existing?.path === input.path) {
            return { added: false, path: input.path, repository };
        }
        if (existing) {
            throw new RepoFolderRefusalError(
                'conflict',
                existing.addedByUserId === null
                    ? `${input.computerName} already works on ${repository} in Haus's own clone at ${existing.path}. Remove the Haus clone first, then add your folder.`
                    : `${input.computerName} already has a folder for ${repository} at ${existing.path}. Remove it first.`
            );
        }
        const [taken] = await tx
            .select({ repository: repoFoldersTable.repository })
            .from(repoFoldersTable)
            .where(
                and(
                    eq(repoFoldersTable.serverId, input.serverId),
                    eq(repoFoldersTable.computerId, input.computerId),
                    eq(repoFoldersTable.path, input.path)
                )
            )
            .limit(1);
        if (taken) {
            throw new RepoFolderRefusalError(
                'conflict',
                `${input.path} is already ${input.computerName}'s folder for ${taken.repository}.`
            );
        }
        await upsertRepo(tx, { repository, serverId: input.serverId });
        await tx.insert(repoFoldersTable).values({
            addedByUserId: input.addedByUserId,
            computerId: input.computerId,
            path: input.path,
            repository,
            serverId: input.serverId,
        });
        return { added: true, path: input.path, repository };
    });
}

export async function deleteRepoFolder(
    db: Pick<HausDatabase, 'delete'>,
    input: { computerId: string; repository: string; serverId: string }
) {
    const deleted = await db
        .delete(repoFoldersTable)
        .where(
            and(
                eq(repoFoldersTable.serverId, input.serverId),
                eq(repoFoldersTable.computerId, input.computerId),
                eq(repoFoldersTable.repository, input.repository.toLowerCase())
            )
        )
        .returning({ path: repoFoldersTable.path });
    return deleted.length > 0;
}


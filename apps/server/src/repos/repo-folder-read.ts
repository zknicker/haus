import type { AgentRepoList, RepoFolder } from '@haus/api';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    computersTable,
    repoFoldersTable,
    reposTable,
    serverMembershipsTable,
    usersTable,
} from '../postgres/schema.ts';
import { computerNameSql } from '../computers/computer-name.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function readRepoFolder(
    db: Reader,
    input: { computerId: string; repository: string; serverId: string }
) {
    const [folder] = await db
        .select({ addedByUserId: repoFoldersTable.addedByUserId, path: repoFoldersTable.path })
        .from(repoFoldersTable)
        .where(
            and(
                eq(repoFoldersTable.serverId, input.serverId),
                eq(repoFoldersTable.computerId, input.computerId),
                eq(repoFoldersTable.repository, input.repository.toLowerCase())
            )
        )
        .limit(1);
    return folder ?? null;
}

export async function readComputerRepoFolders(
    db: Reader,
    input: { computerId: string; serverId: string }
) {
    const rows = await db
        .select({
            addedAt: repoFoldersTable.createdAt,
            addedByUserId: repoFoldersTable.addedByUserId,
            adderName: sql<
                string | null
            >`coalesce(nullif(btrim(${usersTable.displayName}), ''), ${serverMembershipsTable.handle})`,
            computerId: repoFoldersTable.computerId,
            path: repoFoldersTable.path,
            repository: repoFoldersTable.repository,
        })
        .from(repoFoldersTable)
        .leftJoin(usersTable, eq(usersTable.id, repoFoldersTable.addedByUserId))
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, repoFoldersTable.serverId),
                eq(serverMembershipsTable.userId, repoFoldersTable.addedByUserId)
            )
        )
        .where(
            and(
                eq(repoFoldersTable.serverId, input.serverId),
                eq(repoFoldersTable.computerId, input.computerId)
            )
        )
        .orderBy(asc(repoFoldersTable.repository));
    return rows.map(
        (row) =>
            ({
                addedAt: row.addedAt.toISOString(),
                addedBy: row.addedByUserId
                    ? { name: row.adderName ?? 'A former member', userId: row.addedByUserId }
                    : null,
                computerId: row.computerId,
                path: row.path,
                repository: row.repository,
            }) satisfies RepoFolder
    );
}

export async function readRepoFolderNames(
    db: Reader,
    serverId: string,
    computerIds: readonly string[]
) {
    const byComputer = new Map<string, string[]>();
    if (computerIds.length === 0) {
        return byComputer;
    }
    const rows = await db
        .select({
            computerId: repoFoldersTable.computerId,
            repository: repoFoldersTable.repository,
        })
        .from(repoFoldersTable)
        .where(
            and(
                eq(repoFoldersTable.serverId, serverId),
                inArray(repoFoldersTable.computerId, [...computerIds])
            )
        )
        .orderBy(asc(repoFoldersTable.repository));
    for (const row of rows) {
        byComputer.set(row.computerId, [...(byComputer.get(row.computerId) ?? []), row.repository]);
    }
    return byComputer;
}

export async function listServerRepos(db: Reader, serverId: string) {
    const rows = await db
        .select({
            computerId: repoFoldersTable.computerId,
            computerName: computerNameSql,
            repository: reposTable.repository,
        })
        .from(reposTable)
        .leftJoin(
            repoFoldersTable,
            and(
                eq(repoFoldersTable.serverId, reposTable.serverId),
                eq(repoFoldersTable.repository, reposTable.repository)
            )
        )
        .leftJoin(
            computersTable,
            and(
                eq(computersTable.serverId, repoFoldersTable.serverId),
                eq(computersTable.id, repoFoldersTable.computerId)
            )
        )
        .where(eq(reposTable.serverId, serverId))
        .orderBy(asc(reposTable.repository), asc(repoFoldersTable.createdAt));
    const repos = new Map<string, AgentRepoList['repos'][number]>();
    for (const row of rows) {
        const repo = repos.get(row.repository) ?? { computers: [], repository: row.repository };
        if (row.computerId) {
            repo.computers.push({ computerId: row.computerId, name: row.computerName });
        }
        repos.set(row.repository, repo);
    }
    return { repos: [...repos.values()] } satisfies AgentRepoList;
}

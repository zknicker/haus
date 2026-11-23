import type { RepoFolderState, RepoList, RepoListFolder } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import type { ComputerConnections } from '../computers/connections.ts';
import { RepoFolderComputerUnavailableError } from '../computers/repo-folder-replies.ts';
import type { GithubApp } from '../github/github-app.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, repoFoldersTable, reposTable } from '../postgres/schema.ts';
import { computerNameSql } from '../projects/project-worker-read.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readRepoGithubAccess } from './repo-github-access.ts';

type Connections = Pick<ComputerConnections, 'isOnline' | 'repoFolders'>;

export async function listRepos(
    db: HausDatabase,
    connections: Connections,
    app: GithubApp | null,
    member: Pick<HausUser, 'id'> | null,
    serverId: string
) {
    const server = await requireServerMembership(db, member, serverId);
    const rows = await readRepoFolderRows(db, serverId);
    const repositories = [...new Set(rows.map((row) => row.repository))];
    const [github, states] = await Promise.all([
        readRepoGithubAccess(db, app, serverId),
        readFolderStates(connections, rows),
    ]);
    const repos = await Promise.all(
        repositories.map(async (repository) => ({
            folders: rows.flatMap((row) =>
                row.repository === repository && row.folder
                    ? [{ ...row.folder, state: states.get(folderKey(row.folder)) ?? null }]
                    : []
            ),
            githubAccess: await github.accessOf(repository),
            repository,
        }))
    );
    return {
        canInstallGithubApp:
            app !== null &&
            github.connectionId !== null &&
            (server.role === 'owner' || server.role === 'admin'),
        githubConnectionId: github.connectionId,
        repos,
    } satisfies RepoList;
}

async function readRepoFolderRows(db: HausDatabase, serverId: string) {
    const rows = await db
        .select({
            computerId: repoFoldersTable.computerId,
            computerName: computerNameSql,
            path: repoFoldersTable.path,
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
    return rows.map((row) => ({
        folder:
            row.computerId && row.path
                ? {
                      computerId: row.computerId,
                      computerName: row.computerName,
                      path: row.path,
                  }
                : null,
        repository: row.repository,
    }));
}

async function readFolderStates(
    connections: Connections,
    rows: Awaited<ReturnType<typeof readRepoFolderRows>>
) {
    const byComputer = new Map<string, { path: string; repository: string }[]>();
    for (const { folder, repository } of rows) {
        if (folder && connections.isOnline(folder.computerId)) {
            byComputer.set(folder.computerId, [
                ...(byComputer.get(folder.computerId) ?? []),
                { path: folder.path, repository },
            ]);
        }
    }
    const states = new Map<string, RepoFolderState>();
    await Promise.all(
        [...byComputer].map(async ([computerId, folders]) => {
            const answer = await connections.repoFolders
                .request(computerId, { folders, kind: 'check' })
                .catch((cause: unknown) => {
                    if (cause instanceof RepoFolderComputerUnavailableError) {
                        return null;
                    }
                    throw cause;
                });
            if (answer?.kind !== 'check') {
                return;
            }
            for (const { path, state } of answer.states) {
                states.set(folderKey({ computerId, path }), state);
            }
        })
    );
    return states;
}

function folderKey(folder: Pick<RepoListFolder, 'computerId' | 'path'>) {
    return `${folder.computerId}\u0000${folder.path}`;
}

import type { ProjectRepo, WorkerPlaceKind, WorkerPlaceView } from '@haus/api';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, projectRepoLinksTable, projectReposTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export const computerNameSql = sql<
    string | null
>`nullif(btrim(${computersTable.reportedInventory} ->> 'name'), '')`;

export function defaultWorkerPlaceOf(row: {
    defaultWorkerComputerId: string | null;
    defaultWorkerComputerName: string | null;
    defaultWorkerPlace: WorkerPlaceKind | null;
}) {
    if (row.defaultWorkerPlace === null) {
        return null;
    }
    if (row.defaultWorkerPlace !== 'computer') {
        return { kind: row.defaultWorkerPlace } satisfies WorkerPlaceView;
    }
    if (row.defaultWorkerComputerId === null) {
        throw new Error('A Computer default place has no Computer.');
    }
    return {
        computerId: row.defaultWorkerComputerId,
        computerName: row.defaultWorkerComputerName,
        kind: 'computer',
    } satisfies WorkerPlaceView;
}

export async function readProjectRepos(
    db: Reader,
    serverId: string,
    projectIds: readonly string[]
) {
    const byProject = new Map<string, ProjectRepo[]>();
    if (projectIds.length === 0) {
        return byProject;
    }
    const repos = await db
        .select({
            id: projectReposTable.id,
            projectId: projectReposTable.projectId,
            repository: projectReposTable.repository,
        })
        .from(projectReposTable)
        .where(
            and(
                eq(projectReposTable.serverId, serverId),
                inArray(projectReposTable.projectId, [...projectIds])
            )
        )
        .orderBy(asc(projectReposTable.repository), asc(projectReposTable.id));
    const links = await readLinks(
        db,
        serverId,
        repos.map((repo) => repo.id)
    );
    for (const { projectId, ...repo } of repos) {
        const listed = byProject.get(projectId) ?? [];
        listed.push({ ...repo, links: links.get(repo.id) ?? [] });
        byProject.set(projectId, listed);
    }
    return byProject;
}

async function readLinks(db: Reader, serverId: string, repoIds: readonly string[]) {
    const byRepo = new Map<string, ProjectRepo['links']>();
    if (repoIds.length === 0) {
        return byRepo;
    }
    const rows = await db
        .select({
            checkoutPath: projectRepoLinksTable.checkoutPath,
            computerId: projectRepoLinksTable.computerId,
            computerName: computerNameSql,
            projectRepoId: projectRepoLinksTable.projectRepoId,
        })
        .from(projectRepoLinksTable)
        .innerJoin(
            computersTable,
            and(
                eq(computersTable.serverId, projectRepoLinksTable.serverId),
                eq(computersTable.id, projectRepoLinksTable.computerId)
            )
        )
        .where(
            and(
                eq(projectRepoLinksTable.serverId, serverId),
                inArray(projectRepoLinksTable.projectRepoId, [...repoIds])
            )
        )
        .orderBy(asc(projectRepoLinksTable.createdAt), asc(projectRepoLinksTable.computerId));
    for (const { projectRepoId, ...link } of rows) {
        byRepo.set(projectRepoId, [...(byRepo.get(projectRepoId) ?? []), link]);
    }
    return byRepo;
}

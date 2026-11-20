import { createHash, randomBytes } from 'node:crypto';
import type { WorkerRuntime } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    computersTable,
    projectRepoLinksTable,
    projectReposTable,
} from '../src/postgres/schema.ts';
import type { WorkerBoard } from './worker-board.fixture.ts';

interface ComputerPlaceSetup {
    enabled?: boolean;
    health?: 'healthy' | 'offline';
    limit?: number;
    name?: string;
    ready?: readonly WorkerRuntime[];
}

export async function setComputerPlace(
    db: HausDatabase,
    board: WorkerBoard,
    computerId: string,
    setup: ComputerPlaceSetup = {}
) {
    const ready = new Set(setup.ready ?? ['claude-code']);
    const [current] = await db
        .select({ inventory: computersTable.reportedInventory })
        .from(computersTable)
        .where(eq(computersTable.id, computerId));
    await db
        .update(computersTable)
        .set({
            health: setup.health ?? 'healthy',
            reportedInventory: {
                ...current?.inventory,
                name: setup.name ?? 'mini',
                runtimes: current?.inventory?.runtimes ?? [],
                workerRuntimes: (['claude-code', 'codex'] as const).map((runtime) => ({
                    detail: null,
                    ready: ready.has(runtime),
                    runtime,
                })),
            },
            workerLimit: setup.limit ?? 4,
            workersEnabled: setup.enabled ?? true,
        })
        .where(
            and(eq(computersTable.serverId, board.seed.serverId), eq(computersTable.id, computerId))
        );
}

export async function attachAnotherComputer(
    db: HausDatabase,
    board: WorkerBoard,
    setup: ComputerPlaceSetup = {}
) {
    const computerId = createOpaqueId('cmp');
    const credential = randomBytes(32).toString('hex');
    await db.insert(computersTable).values({
        attachedByUserId: board.seed.userId,
        credentialHash: createHash('sha256').update(credential).digest('hex'),
        id: computerId,
        reportedInventory: { runtimes: [] },
        serverId: board.seed.serverId,
    });
    await setComputerPlace(db, board, computerId, setup);
    return computerId;
}

export async function addLinkedRepo(
    db: HausDatabase,
    board: WorkerBoard,
    repository: string,
    links: ReadonlyArray<{ checkoutPath: string | null; computerId: string }>
) {
    const projectRepoId = createOpaqueId('prp');
    await db.insert(projectReposTable).values({
        id: projectRepoId,
        projectId: board.seed.channelId,
        repository,
        serverId: board.seed.serverId,
    });
    for (const link of links) {
        await db.insert(projectRepoLinksTable).values({
            checkoutPath: link.checkoutPath,
            computerId: link.computerId,
            linkedByUserId: board.seed.userId,
            projectRepoId,
            serverId: board.seed.serverId,
        });
    }
    return projectRepoId;
}

export async function readProjectRepositories(db: HausDatabase, board: WorkerBoard) {
    const rows = await db
        .select({ repository: projectReposTable.repository })
        .from(projectReposTable)
        .where(eq(projectReposTable.projectId, board.seed.channelId))
        .orderBy(projectReposTable.repository);
    return rows.map((row) => row.repository);
}

import { createHash, randomBytes } from 'node:crypto';
import type { ComputerRuntime, WorkerRuntime } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { computersTable, repoFoldersTable, reposTable } from '../src/postgres/schema.ts';
import type { WorkerBoard } from './worker-board.fixture.ts';

interface ComputerPlaceSetup {
    enabled?: boolean;
    health?: 'healthy' | 'offline';
    limit?: number;
    name?: string;
    ready?: readonly WorkerRuntime[];
    runtimes?: ComputerRuntime[];
}

export const fixtureRuntimes: ComputerRuntime[] = [
    {
        id: 'claude-code',
        label: 'Claude Code',
        models: [{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }],
    },
    {
        id: 'codex',
        label: 'Codex',
        models: [
            { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
            { id: 'gpt-5.5', label: 'GPT-5.5' },
        ],
    },
];

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
                runtimes: setup.runtimes ?? fixtureRuntimes,
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

export async function addRepoFolders(
    db: HausDatabase,
    board: WorkerBoard,
    repository: string,
    folders: ReadonlyArray<{ computerId: string; path: string }>
) {
    await db
        .insert(reposTable)
        .values({ repository, serverId: board.seed.serverId })
        .onConflictDoNothing();
    for (const folder of folders) {
        await db.insert(repoFoldersTable).values({
            addedByUserId: board.seed.userId,
            computerId: folder.computerId,
            path: folder.path,
            repository,
            serverId: board.seed.serverId,
        });
    }
}

export async function readServerRepositories(db: HausDatabase, board: WorkerBoard) {
    const rows = await db
        .select({ repository: reposTable.repository })
        .from(reposTable)
        .where(eq(reposTable.serverId, board.seed.serverId))
        .orderBy(reposTable.repository);
    return rows.map((row) => row.repository);
}

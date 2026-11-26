import {
    type WorkerPlace,
    type WorkerPlaceEntry,
    type WorkerPlacesResponse,
    cloudAgentProviders,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { readAccessibleComputerIds } from '../computer-access/agent-access.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, workerPlaceLimitsTable } from '../postgres/schema.ts';
import { readRepoFolderNames } from '../repos/repo-folder-read.ts';
import { readTaskByRef } from '../tasks/task-list.ts';
import { isComputerPlaceUsable, readComputerPlaces } from './computer-places.ts';
import { defaultWorkerPlaceLimit, readFreeSlots } from './dispatch-worker-turns.ts';
import { WorkerTaskRequiredError } from './errors.ts';
import { readProjectDefaultPlace } from './resolve-worker-place.ts';
import { readReadyPlaces } from './worker-carrier.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function listWorkerPlaces(
    db: Reader,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    taskRef: string | undefined
) {
    const { serverId } = runner;
    const task = taskRef ? await readPlacesTask(db, runner, taskRef) : null;
    const projectDefault = task
        ? await readProjectDefaultPlace(db, serverId, task.projectId)
        : null;
    const isDefault = (place: WorkerPlace) =>
        projectDefault !== null &&
        projectDefault.kind === place.kind &&
        (place.kind !== 'computer' ||
            (projectDefault.kind === 'computer' && projectDefault.computerId === place.computerId));
    const free = await readFreeSlots(db, serverId);
    const slotsOf = (key: string, limit: number) =>
        Math.max(0, Math.min(limit, free.get(key) ?? 0));
    const ready = new Set((await readReadyPlaces(db, serverId)).map((place) => place.kind));
    const limits = await cloudLimits(db, serverId);
    const computers = await readComputerPlaces(db, serverId);
    const reachable = await readAccessibleComputerIds(db, runner);
    const machineId = await readMachineId(db, runner);
    const folders = await readRepoFolderNames(
        db,
        serverId,
        computers.map((computer) => computer.computerId)
    );
    const places: WorkerPlaceEntry[] = [
        ...cloudAgentProviders.map((kind) => ({
            freeSlots: slotsOf(kind, limits.get(kind) ?? 0),
            kind,
            limit: limits.get(kind) ?? 0,
            projectDefault: isDefault({ kind }),
            ready: ready.has(kind),
        })),
        ...computers.map((computer) => ({
            allowed: computer.computerId === machineId || reachable.has(computer.computerId),
            computerId: computer.computerId,
            freeSlots: slotsOf(`computer:${computer.computerId}`, computer.limit),
            kind: 'computer' as const,
            limit: computer.limit,
            name: computer.name,
            online: computer.online,
            projectDefault: isDefault({ computerId: computer.computerId, kind: 'computer' }),
            ready: isComputerPlaceUsable(computer),
            repoFolders: folders.get(computer.computerId) ?? [],
            runtimes: computer.runtimes,
            workersEnabled: computer.workersEnabled,
        })),
    ];
    return { places, task: task?.shortId ?? null } satisfies WorkerPlacesResponse;
}

async function readMachineId(db: Reader, runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>) {
    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    return agent?.computerId ?? null;
}

async function readPlacesTask(
    db: Reader,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    taskRef: string
) {
    const task = await readTaskByRef(db, { ref: taskRef, serverId: runner.serverId });
    if (!task) {
        throw new WorkerTaskRequiredError(`Task ${taskRef} does not exist or you cannot see it.`);
    }
    return task;
}

async function cloudLimits(db: Reader, serverId: string) {
    const rows = await db
        .select({ limit: workerPlaceLimitsTable.workerLimit, place: workerPlaceLimitsTable.place })
        .from(workerPlaceLimitsTable)
        .where(eq(workerPlaceLimitsTable.serverId, serverId));
    return new Map(
        cloudAgentProviders.map((place) => [
            place,
            rows.find((row) => row.place === place)?.limit ?? defaultWorkerPlaceLimit,
        ])
    );
}

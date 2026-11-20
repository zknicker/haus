import {
    type WorkerPlace,
    type WorkerPlaceEntry,
    type WorkerPlacesResponse,
    cloudAgentProviders,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { resolveTaskTargetChat } from '../agent-api/resolve-task-target.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    projectRepoLinksTable,
    projectReposTable,
    workerPlaceLimitsTable,
} from '../postgres/schema.ts';
import { readTask } from '../tasks/task-read.ts';
import { isComputerPlaceUsable, readComputerPlaces } from './computer-places.ts';
import { defaultWorkerPlaceLimit, readFreeSlots } from './dispatch-worker-turns.ts';
import { WorkerTaskRequiredError } from './errors.ts';
import { readProjectDefaultPlace } from './resolve-worker-place.ts';
import { readReadyPlaces } from './worker-carrier.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function listWorkerPlaces(
    db: Reader,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    taskKey: string | undefined
) {
    const { serverId } = runner;
    const task = taskKey ? await readPlacesTask(db, runner, taskKey) : null;
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
    const links = await readLinks(db, serverId, task?.projectId ?? null);
    const places: WorkerPlaceEntry[] = [
        ...cloudAgentProviders.map((kind) => ({
            freeSlots: slotsOf(kind, limits.get(kind) ?? 0),
            kind,
            limit: limits.get(kind) ?? 0,
            projectDefault: isDefault({ kind }),
            ready: ready.has(kind),
        })),
        ...(await readComputerPlaces(db, serverId)).map((computer) => ({
            computerId: computer.computerId,
            freeSlots: slotsOf(`computer:${computer.computerId}`, computer.limit),
            kind: 'computer' as const,
            limit: computer.limit,
            linkedRepositories: [
                ...new Set(
                    links
                        .filter((link) => link.computerId === computer.computerId)
                        .map((link) => link.repository)
                ),
            ],
            name: computer.name,
            online: computer.online,
            projectDefault: isDefault({ computerId: computer.computerId, kind: 'computer' }),
            ready: isComputerPlaceUsable(computer),
            runtimes: computer.runtimes,
            workersEnabled: computer.workersEnabled,
        })),
    ];
    return {
        places,
        repositories: task ? await readProjectRepositories(db, serverId, task.projectId) : [],
        task: task?.key ?? null,
    } satisfies WorkerPlacesResponse;
}

async function readPlacesTask(
    db: Reader,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    taskKey: string
) {
    const reached = await resolveTaskTargetChat(db, runner, taskKey);
    if (!reached) {
        throw new WorkerTaskRequiredError(`Task ${taskKey} does not exist or you cannot see it.`);
    }
    return await readTask(db, runner.serverId, reached.taskId);
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

async function readLinks(db: Reader, serverId: string, projectId: string | null) {
    return await db
        .select({
            computerId: projectRepoLinksTable.computerId,
            repository: projectReposTable.repository,
        })
        .from(projectRepoLinksTable)
        .innerJoin(
            projectReposTable,
            and(
                eq(projectReposTable.serverId, projectRepoLinksTable.serverId),
                eq(projectReposTable.id, projectRepoLinksTable.projectRepoId)
            )
        )
        .where(
            and(
                eq(projectRepoLinksTable.serverId, serverId),
                projectId ? eq(projectReposTable.projectId, projectId) : undefined
            )
        )
        .orderBy(projectReposTable.repository);
}

async function readProjectRepositories(db: Reader, serverId: string, projectId: string) {
    const rows = await db
        .select({ repository: projectReposTable.repository })
        .from(projectReposTable)
        .where(
            and(
                eq(projectReposTable.serverId, serverId),
                eq(projectReposTable.projectId, projectId)
            )
        )
        .orderBy(projectReposTable.repository);
    return rows.map((row) => row.repository);
}

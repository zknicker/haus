import type { AgentWorkerStartInput, WorkerPlace, WorkerRuntime } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { projectRepoLinksTable, projectReposTable } from '../postgres/schema.ts';
import { computerPlaceLabel, readComputerPlace, readyRuntimeOf } from './computer-places.ts';
import { WorkerOptionCloudError, WorkerPlaceRequiredError } from './errors.ts';
import {
    WorkerComputerUnavailableError,
    WorkerPlaceOffError,
    WorkerPlaceUnknownError,
    WorkerProjectDefaultUnusableError,
    WorkerProjectReposError,
    WorkerRepoNotLinkedError,
    WorkerRuntimeUnavailableError,
} from './place-errors.ts';
import {
    isPlaceUsable,
    readProjectDefaultPlace,
    readUsablePlaces,
} from './resolve-worker-place.ts';
import { chooseCarrier, readDefaultPlace } from './worker-carrier.ts';
import { chooseWorkerModel } from './worker-model.ts';

export interface WorkerStartPlan {
    addRepository: boolean;
    carrierComputerId: string;
    model: string | null;
    place: WorkerPlace;
    repository: string;
    runtime: WorkerRuntime | null;
}

export async function resolveWorkerStart(
    tx: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    input: AgentWorkerStartInput & { projectId: string; requested: WorkerPlace | null }
) {
    const { serverId } = runner;
    const place = input.requested ?? (await readFallbackPlace(tx, runner, input.projectId));
    const repo = await resolveRepository(tx, serverId, input);
    if (place.kind !== 'computer') {
        if (input.runtime || input.model) {
            throw new WorkerOptionCloudError(place.kind);
        }
        return {
            addRepository: repo.id === null,
            carrierComputerId: await chooseCarrier(tx, {
                agentId: runner.agentId,
                place: place.kind,
                serverId,
            }),
            model: null,
            place,
            repository: repo.repository,
            runtime: null,
        } satisfies WorkerStartPlan;
    }
    const computer = await readComputerPlace(tx, serverId, place.computerId);
    if (!computer) {
        throw new WorkerPlaceUnknownError(`computer:${place.computerId}`);
    }
    const label = computerPlaceLabel(computer);
    if (!computer.workersEnabled) {
        throw new WorkerPlaceOffError(label);
    }
    if (!computer.online) {
        throw new WorkerComputerUnavailableError(label);
    }
    const runtime = readyRuntimeOf(computer, input.runtime ?? null);
    if (!runtime) {
        throw new WorkerRuntimeUnavailableError(label, input.runtime ?? null);
    }
    if (!(repo.id && (await isLinked(tx, serverId, repo.id, computer.computerId)))) {
        throw new WorkerRepoNotLinkedError(repo.repository, label);
    }
    const model = await chooseWorkerModel(tx, {
        agentId: runner.agentId,
        place: computer,
        requested: input.model ?? null,
        runtime,
        serverId,
    });
    return {
        addRepository: false,
        carrierComputerId: computer.computerId,
        model,
        place,
        repository: repo.repository,
        runtime,
    } satisfies WorkerStartPlan;
}

async function readFallbackPlace(
    tx: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    projectId: string
) {
    const projectDefault = await readProjectDefaultPlace(tx, runner.serverId, projectId);
    if (projectDefault) {
        if (!(await isPlaceUsable(tx, runner.serverId, projectDefault))) {
            throw new WorkerProjectDefaultUnusableError(
                projectDefault,
                await readUsablePlaces(tx, runner.serverId)
            );
        }
        return projectDefault;
    }
    const cloudDefault = await readDefaultPlace(tx, runner);
    if (!cloudDefault) {
        throw new WorkerPlaceRequiredError(await readUsablePlaces(tx, runner.serverId));
    }
    return { kind: cloudDefault } satisfies WorkerPlace;
}

async function resolveRepository(
    tx: HausDatabase,
    serverId: string,
    input: { projectId: string; repository?: string | undefined }
) {
    const repos = await tx
        .select({ id: projectReposTable.id, repository: projectReposTable.repository })
        .from(projectReposTable)
        .where(
            and(
                eq(projectReposTable.serverId, serverId),
                eq(projectReposTable.projectId, input.projectId)
            )
        )
        .orderBy(projectReposTable.repository);
    const { repository } = input;
    if (repository) {
        const known = repos.find(
            (repo) => repo.repository.toLowerCase() === repository.toLowerCase()
        );
        return known ?? { id: null, repository };
    }
    const [only, ...others] = repos;
    if (!only || others.length > 0) {
        throw new WorkerProjectReposError(repos.map((repo) => repo.repository));
    }
    return only;
}

async function isLinked(
    tx: HausDatabase,
    serverId: string,
    projectRepoId: string,
    computerId: string
) {
    const [link] = await tx
        .select({ computerId: projectRepoLinksTable.computerId })
        .from(projectRepoLinksTable)
        .where(
            and(
                eq(projectRepoLinksTable.serverId, serverId),
                eq(projectRepoLinksTable.projectRepoId, projectRepoId),
                eq(projectRepoLinksTable.computerId, computerId)
            )
        )
        .limit(1);
    return link !== undefined;
}

import type { AgentWorkerStartInput, WorkerPlace, WorkerRuntime } from '@haus/api';
import { isAgentAllowedOn } from '../computer-access/agent-access.ts';
import { readComputerFacts } from '../computer-access/computer-facts.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computerPlaceLabel, readComputerPlace, readyRuntimeOf } from './computer-places.ts';
import { WorkerOptionCloudError, WorkerPlaceRequiredError } from './errors.ts';
import {
    WorkerComputerUnavailableError,
    WorkerPlaceNoAccessError,
    WorkerPlaceOffError,
    WorkerPlaceUnknownError,
    WorkerProjectDefaultUnusableError,
    WorkerRuntimeUnavailableError,
} from './place-errors.ts';
import {
    isPlaceUsable,
    readProjectDefaultPlace,
    readUsablePlaces,
} from './resolve-worker-place.ts';
import { chooseCarrier } from './worker-carrier.ts';
import { chooseWorkerModel } from './worker-model.ts';

export interface WorkerStartPlan {
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
    const place = input.requested ?? (await readProjectPlace(tx, runner.serverId, input.projectId));
    if (place.kind !== 'computer') {
        if (input.runtime || input.model) {
            throw new WorkerOptionCloudError(place.kind);
        }
        return {
            carrierComputerId: await chooseCarrier(tx, {
                agentId: runner.agentId,
                place: place.kind,
                serverId,
            }),
            model: null,
            place,
            repository: input.repository,
            runtime: null,
        } satisfies WorkerStartPlan;
    }
    const computer = await readComputerPlace(tx, serverId, place.computerId);
    if (!computer) {
        throw new WorkerPlaceUnknownError(`computer:${place.computerId}`);
    }
    const label = computerPlaceLabel(computer);
    await requireAgentAccess(tx, { ...runner, computerId: computer.computerId });
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
    const model = await chooseWorkerModel(tx, {
        agentId: runner.agentId,
        place: computer,
        requested: input.model ?? null,
        runtime,
        serverId,
    });
    return {
        carrierComputerId: computer.computerId,
        model,
        place,
        repository: input.repository,
        runtime,
    } satisfies WorkerStartPlan;
}

async function requireAgentAccess(
    tx: HausDatabase,
    input: { agentId: string; computerId: string; serverId: string }
) {
    if (await isAgentAllowedOn(tx, input)) {
        return;
    }
    const facts = await readComputerFacts(tx, input);
    if (!facts) {
        throw new WorkerPlaceUnknownError(`computer:${input.computerId}`);
    }
    throw new WorkerPlaceNoAccessError(facts);
}

async function readProjectPlace(tx: HausDatabase, serverId: string, projectId: string) {
    const projectDefault = await readProjectDefaultPlace(tx, serverId, projectId);
    if (!projectDefault) {
        throw new WorkerPlaceRequiredError(await readUsablePlaces(tx, serverId));
    }
    if (!(await isPlaceUsable(tx, serverId, projectDefault))) {
        throw new WorkerProjectDefaultUnusableError(
            projectDefault,
            await readUsablePlaces(tx, serverId)
        );
    }
    return projectDefault;
}

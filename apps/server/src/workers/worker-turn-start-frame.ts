import type { WorkerTurnStartFrame } from '@haus/api';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatsTable,
    projectsTable,
    taskKeysTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import { readRepoFolder } from '../repos/repo-folder-read.ts';
import { readTask } from '../tasks/task-read.ts';
import { composeWorkerInput } from './compose-worker-input.ts';
import { workerPlaceOf } from './worker-row-place.ts';

type TurnRow = typeof workerTurnsTable.$inferSelect;
type WorkerRow = typeof workersTable.$inferSelect;

export async function workerTurnStartFrame(
    tx: HausDatabase,
    storage: ArtifactStorage | null,
    input: { turn: TurnRow; worker: WorkerRow }
) {
    const { turn, worker } = input;
    if (!(worker.taskId && turn.input)) {
        throw new Error(`Worker turn ${turn.id} has no Task or input to start.`);
    }
    const task = await readTask(tx, worker.serverId, worker.taskId);
    const predecessors = await tx
        .select({ id: workerTurnsTable.id })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, worker.serverId),
                eq(workerTurnsTable.workerId, worker.id),
                lt(workerTurnsTable.createdAt, turn.createdAt)
            )
        )
        .orderBy(asc(workerTurnsTable.createdAt), asc(workerTurnsTable.id));
    const place = workerPlaceOf(worker);
    const project = await readProjectFacts(tx, worker.serverId, task.projectId);
    const composed = await composeWorkerInput(tx, storage, {
        agentHandle: await agentHandleOf(tx, worker),
        delivered: worker.workerMdRevisionId,
        inputs: turn.input,
        isHausProject: project.isHaus,
        place: place.kind === 'computer' ? 'computer' : 'cloud',
        projectKey: project.key,
        serverId: worker.serverId,
        taskShortId: task.shortId,
    });
    const [sent] = await tx
        .update(workerTurnsTable)
        .set({
            dispatchAttempt: sql`${workerTurnsTable.dispatchAttempt} + 1`,
            workerMdRevisionId: composed.workerMdRevisionId,
        })
        .where(
            and(eq(workerTurnsTable.serverId, worker.serverId), eq(workerTurnsTable.id, turn.id))
        )
        .returning({ attempt: workerTurnsTable.dispatchAttempt });
    if (!sent) {
        throw new Error(`Worker turn ${turn.id} vanished before its start was sent.`);
    }
    const branch = worker.branch ?? `haus/${worker.id}/${task.shortId}`;
    if (place.kind === 'computer' && !worker.branch) {
        await tx
            .update(workersTable)
            .set({ branch })
            .where(and(eq(workersTable.serverId, worker.serverId), eq(workersTable.id, worker.id)));
    }
    return {
        agentId: worker.agentId,
        attempt: sent.attempt,
        checkout:
            place.kind === 'computer'
                ? {
                      branch,
                      checkoutPath: (await readRepoFolder(tx, carriedRepo(worker)))?.path ?? null,
                      repository: worker.repository,
                      startingRef: worker.startingRef,
                  }
                : null,
        input: composed.input,
        model: {
            droppedParams: turn.modelDroppedParams,
            fallbackFrom: turn.modelFallbackFrom,
            id: turn.modelId,
            params: turn.modelParams,
        },
        place,
        predecessorTurnIds: predecessors.map(({ id }) => id),
        providerAgentId: worker.providerAgentId,
        repository: worker.repository,
        resumeSessionId: place.kind === 'computer' ? worker.nativeSessionId : null,
        runtime: worker.runtime,
        startingRef: worker.startingRef,
        title: worker.title,
        turnId: turn.id,
        type: 'worker-turn-start',
        workerId: worker.id,
        workerMdRevisionId: composed.workerMdRevisionId,
    } satisfies WorkerTurnStartFrame;
}

function carriedRepo(worker: WorkerRow) {
    return {
        computerId: worker.carrierComputerId,
        repository: worker.repository,
        serverId: worker.serverId,
    };
}

async function agentHandleOf(tx: HausDatabase, worker: WorkerRow) {
    const [agent] = await tx
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, worker.serverId), eq(agentsTable.id, worker.agentId)))
        .limit(1);
    if (!agent) {
        throw new Error(`Worker ${worker.id}'s Agent is missing, so its turn cannot compose.`);
    }
    return agent.handle;
}

async function readProjectFacts(tx: HausDatabase, serverId: string, projectId: string) {
    const [project] = await tx
        .select({ isHaus: chatsTable.isAll, key: taskKeysTable.key })
        .from(projectsTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, projectsTable.serverId),
                eq(chatsTable.id, projectsTable.chatId)
            )
        )
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .where(and(eq(projectsTable.serverId, serverId), eq(projectsTable.chatId, projectId)))
        .limit(1);
    if (!project) {
        throw new Error(`Project ${projectId} is missing, so a Worker turn cannot compose.`);
    }
    return project;
}

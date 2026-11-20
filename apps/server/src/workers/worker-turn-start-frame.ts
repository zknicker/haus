import type { WorkerTurnStartFrame } from '@haus/api';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatsTable,
    projectRepoLinksTable,
    projectReposTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
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
    const composed = await composeWorkerInput(tx, storage, {
        agentHandle: await agentHandleOf(tx, worker),
        delivered: worker.workerMdRevisionId,
        inputs: turn.input,
        isHausProject: await isHausProject(tx, worker.serverId, task.projectId),
        place: place.kind === 'computer' ? 'computer' : 'cloud',
        serverId: worker.serverId,
        taskKey: task.key,
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
    const branch = worker.branch ?? `haus/${task.key.toLowerCase()}-${worker.id}`;
    if (place.kind === 'computer' && !worker.branch) {
        await tx
            .update(workersTable)
            .set({ branch })
            .where(and(eq(workersTable.serverId, worker.serverId), eq(workersTable.id, worker.id)));
    }
    return {
        attempt: sent.attempt,
        checkout:
            place.kind === 'computer'
                ? {
                      branch,
                      checkoutPath: await linkedCheckoutPath(tx, worker, task.projectId),
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

async function isHausProject(tx: HausDatabase, serverId: string, projectId: string) {
    const [chat] = await tx
        .select({ isAll: chatsTable.isAll })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, projectId)))
        .limit(1);
    return chat?.isAll ?? false;
}

async function linkedCheckoutPath(tx: HausDatabase, worker: WorkerRow, projectId: string) {
    const [link] = await tx
        .select({ checkoutPath: projectRepoLinksTable.checkoutPath })
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
                eq(projectRepoLinksTable.serverId, worker.serverId),
                eq(projectRepoLinksTable.computerId, worker.carrierComputerId),
                eq(projectReposTable.projectId, projectId),
                sql`lower(${projectReposTable.repository}) = lower(${worker.repository})`
            )
        )
        .limit(1);
    return link?.checkoutPath ?? null;
}

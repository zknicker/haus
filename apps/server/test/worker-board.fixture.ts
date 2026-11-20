import type { AgentWorkerStartInput, WorkerObservation, WorkerPlace } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { computersTable, tasksTable, workerTurnsTable } from '../src/postgres/schema.ts';
import { readTask } from '../src/tasks/task-read.ts';
import { setTaskState } from '../src/tasks/task-set-state.ts';
import { applyWorkerObservation } from '../src/workers/apply-worker-observation.ts';
import { startWorker } from '../src/workers/start-worker.ts';
import { insertTaskPlace, seedTaskBoard } from './task-delivery-fixture.ts';

export type WorkerBoard = Awaited<ReturnType<typeof seedWorkerBoard>>;

export async function seedWorkerBoard(
    db: HausDatabase,
    places: WorkerPlace[] = ['cursor', 'claude']
) {
    const board = await seedTaskBoard(db);
    const { seed } = board;
    await db.execute(sql`
        update agents set home_project_id = ${seed.channelId}
        where server_id = ${seed.serverId} and id = ${seed.agentId}
    `);
    await db.execute(sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${seed.serverId}, ${seed.channelId}, ${seed.userId})
    `);
    await setReadyPlaces(db, seed.serverId, seed.computerId, places);
    const task = await addTask(db, board, 'Fix the flaky delivery test');
    const runner: ResolvedRunner = {
        agentId: seed.agentId,
        capabilities: [],
        chatId: null,
        computerId: seed.computerId,
        runId: 'run_worker_test',
        runnerId: 'rnr_worker_test',
        serverId: seed.serverId,
    };
    return { board, runner, seed, task };
}

export async function addTask(
    db: HausDatabase,
    board: Awaited<ReturnType<typeof seedTaskBoard>>,
    title: string
) {
    const taskId = await insertTaskPlace(db, board, title);
    const task = await readTask(db, board.seed.serverId, taskId);
    if (!task.chatId) {
        throw new Error('The seeded Task has no Chat.');
    }
    return { chatId: task.chatId, id: task.id, key: task.key };
}

export async function setReadyPlaces(
    db: HausDatabase,
    serverId: string,
    computerId: string,
    places: WorkerPlace[],
    health: 'healthy' | 'offline' = 'healthy',
    defaultPlace: WorkerPlace | null = null
) {
    await db
        .update(computersTable)
        .set({
            health,
            reportedInventory: {
                cloudAgentProviders: places.map((provider) => ({
                    isDefault: provider === defaultPlace,
                    models: null,
                    provider,
                    ready: true,
                    reason: null,
                })),
            },
        })
        .where(and(eq(computersTable.serverId, serverId), eq(computersTable.id, computerId)));
}

export function startInput(board: WorkerBoard, overrides: Partial<AgentWorkerStartInput> = {}) {
    return {
        brief: 'Make the delivery test deterministic.',
        nonce: `start-${crypto.randomUUID()}`,
        place: 'cursor',
        repository: 'haus/haus',
        startingRef: 'main',
        task: board.task.key,
        title: 'Fix the flaky delivery test',
        ...overrides,
    } satisfies AgentWorkerStartInput;
}

export async function startOn(
    db: HausDatabase,
    board: WorkerBoard,
    overrides: Partial<AgentWorkerStartInput> = {}
) {
    const started = await startWorker(db, board.runner, startInput(board, overrides));
    if (started.kind !== 'started') {
        throw new Error('The Worker start was held.');
    }
    return started;
}

export async function observe(
    db: HausDatabase,
    delivery: AgentDelivery,
    board: WorkerBoard,
    observation: Omit<WorkerObservation, 'observedAt'> & { observedAt?: string }
) {
    return await applyWorkerObservation(
        db,
        {
            computerId: board.seed.computerId,
            observation: { observedAt: new Date().toISOString(), ...observation },
            serverId: board.seed.serverId,
        },
        delivery
    );
}

export async function readTurns(db: HausDatabase, workerId: string) {
    return await db
        .select()
        .from(workerTurnsTable)
        .where(eq(workerTurnsTable.workerId, workerId))
        .orderBy(workerTurnsTable.createdAt);
}

export async function readTaskState(db: HausDatabase, taskId: string) {
    const [task] = await db
        .select({ state: tasksTable.state, version: tasksTable.version })
        .from(tasksTable)
        .where(eq(tasksTable.id, taskId));
    return task;
}

export async function closeTask(db: HausDatabase, board: WorkerBoard, delivery: AgentDelivery) {
    const current = await readTaskState(db, board.task.id);
    return await setTaskState(db, { kind: 'user', userId: board.seed.userId }, delivery, {
        expectedVersion: current?.version ?? 1,
        serverId: board.seed.serverId,
        state: 'done',
        taskId: board.task.id,
    });
}

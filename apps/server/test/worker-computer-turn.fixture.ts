import type { WorkerTurnEndedFrame } from '@haus/api';
import { eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { computersTable, workerTurnsTable } from '../src/postgres/schema.ts';
import { settleComputerTurn } from '../src/workers/settle-computer-turn.ts';
import { mintWorkerTurnCredential } from '../src/workers/worker-credentials.ts';
import { type WorkerBoard, readTurns, seedWorkerBoard, startOn } from './worker-board.fixture.ts';
import { addLinkedRepo, setComputerPlace } from './worker-computer-place.fixture.ts';

export async function computerPlaceBoard(db: HausDatabase) {
    const board = await seedWorkerBoard(db);
    await setComputerPlace(db, board, board.seed.computerId, { limit: 50, name: 'mini' });
    await addLinkedRepo(db, board, 'haus/haus', [
        { checkoutPath: null, computerId: board.seed.computerId },
    ]);
    return board;
}

export async function startComputerWorker(db: HausDatabase, board: WorkerBoard) {
    const { worker } = (await startOn(db, board, { place: 'mini' })).receipt;
    const [turn] = await readTurns(db, worker.id);
    if (!turn) {
        throw new Error('The Computer Worker has no turn.');
    }
    return { turnId: turn.id, workerId: worker.id };
}

export async function endTurn(
    db: HausDatabase,
    delivery: AgentDelivery,
    board: WorkerBoard,
    frame: Partial<WorkerTurnEndedFrame> & Pick<WorkerTurnEndedFrame, 'exit' | 'turnId'>
) {
    return await settleComputerTurn(db, delivery, null, {
        computerId: board.seed.computerId,
        frame: {
            attempt: 1,
            branch: null,
            branches: [],
            detail: null,
            sessionId: null,
            type: 'worker-turn-ended',
            ...frame,
        },
        serverId: board.seed.serverId,
    });
}

export async function setDraft(db: HausDatabase, turnId: string, text: string) {
    await db
        .update(workerTurnsTable)
        .set({
            reportDraft: { ask: null, outcome: 'done', personId: null, pullRequestUrls: [], text },
        })
        .where(eq(workerTurnsTable.id, turnId));
}

export async function requestStop(db: HausDatabase, board: WorkerBoard, turnId: string) {
    await db.execute(sql`update worker_turns
        set stop_requested_at = now(), stop_requested_by_agent_id = ${board.seed.agentId}
        where id = ${turnId}`);
}

export async function takeComputerOffline(db: HausDatabase, board: WorkerBoard) {
    await db.execute(sql`update computers
        set health = 'offline', disconnected_at = now() where id = ${board.seed.computerId}`);
}

export async function bringComputerOnline(db: HausDatabase, board: WorkerBoard) {
    await db.execute(sql`update computers
        set health = 'healthy', disconnected_at = null where id = ${board.seed.computerId}`);
}

export async function mintTurnCredential(db: HausDatabase, board: WorkerBoard, turnId: string) {
    const [computer] = await db
        .select({ credentialHash: computersTable.credentialHash })
        .from(computersTable)
        .where(eq(computersTable.id, board.seed.computerId));
    return await mintWorkerTurnCredential(db, {
        attempt: 1,
        credentialHash: computer?.credentialHash ?? '',
        turnId,
    });
}

export async function readTurn(db: HausDatabase, turnId: string) {
    const [turn] = await db.select().from(workerTurnsTable).where(eq(workerTurnsTable.id, turnId));
    return turn;
}

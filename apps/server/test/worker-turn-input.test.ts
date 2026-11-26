import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { publishArtifact } from '../src/artifacts/publish.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentsTable, workersTable } from '../src/postgres/schema.ts';
import { planCarrierReconnect } from '../src/workers/carrier-frames.ts';
import { acceptComputerTurnInput } from '../src/workers/computer-turn-frames.ts';
import { startWorker } from '../src/workers/start-worker.ts';
import { sendAgentFollowUp } from '../src/workers/worker-operations.ts';
import { offlineDelivery } from './agent-inbox-harness.ts';
import { MemoryArtifactStorage } from './artifact-drive-fixture.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { type WorkerBoard, observe, seedWorkerBoard, startInput } from './worker-board.fixture.ts';
import { computerPlaceBoard, endTurn, setDraft } from './worker-computer-turn.fixture.ts';

let cluster: TestDatabase;
let connection: HausConnection;
const storage = new MemoryArtifactStorage();

beforeAll(async () => {
    cluster = await startMigratedDatabase();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

test('the first turn inlines the rule stack in order, and a later turn carries WORKER.md only when it changed', async () => {
    const board = await computerPlaceBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const handle = await agentHandle(board);
    const haus = await publish(board, 'haus/AGENTS.md', 'Haus rules.');
    const projectKey = 'GEN';
    const project = await publish(board, `projects/${projectKey}/AGENTS.md`, 'Project rules.');
    const workerMd = await publish(board, `agents/${handle}/WORKER.md`, 'Worker rules v1.');
    const scope = { computerId: board.seed.computerId, serverId: board.seed.serverId };

    const started = await startWorker(
        connection.db,
        board.runner,
        startInput(board, { brief: 'Fix it.', place: 'mini' }),
        storage
    );
    if (started.kind !== 'started') {
        throw new Error('held');
    }
    const [first] = started.effects.frames.map(({ frame }) => frame);
    const firstInput = first?.type === 'worker-turn-start' ? first.input : '';
    expect(sectionHeads(firstInput)).toEqual([
        `## haus/AGENTS.md (revision ${haus})`,
        `## projects/${projectKey}/AGENTS.md (revision ${project})`,
        `## agents/${handle}/WORKER.md (revision ${workerMd})`,
        `## Brief from @${handle}`,
    ]);
    expect(first).toMatchObject({ workerMdRevisionId: workerMd });
    const { worker } = started.receipt;
    const turnId = first?.type === 'worker-turn-start' ? first.turnId : '';
    await endTurn(connection.db, delivery, board, { exit: 'crashed-before-launch', turnId });

    const followUp = async (nonce: string) => {
        const sent = await sendAgentFollowUp(
            connection.db,
            board.runner,
            { interrupt: false, nonce, text: 'Again.', workerId: worker.id },
            storage
        );
        const [frame] = sent.effects.frames.map((effect) => effect.frame);
        return frame?.type === 'worker-turn-start' ? frame : null;
    };
    const unacknowledged = await followUp('again-1');
    expect(sectionHeads(unacknowledged?.input ?? '')).toEqual([
        `## agents/${handle}/WORKER.md (revision ${workerMd})`,
        `## Follow-up from @${handle}`,
    ]);
    const changed = await publish(
        board,
        `agents/${handle}/WORKER.md`,
        'Worker rules v2.',
        workerMd
    );
    const resent = (
        await planCarrierReconnect(
            connection.db,
            { id: board.seed.computerId, serverId: board.seed.serverId },
            storage
        )
    ).frames
        .map(({ frame }) => frame)
        .find((frame) => frame.type === 'worker-turn-start');
    expect(resent).toMatchObject({ attempt: 2, workerMdRevisionId: changed });
    await acceptComputerTurnInput(connection.db, scope, {
        attempt: 2,
        turnId: unacknowledged?.turnId ?? '',
        type: 'worker-turn-input-accepted',
        workerMdRevisionId: changed,
    });
    await setDraft(connection.db, unacknowledged?.turnId ?? '', 'Done.');
    await endTurn(connection.db, delivery, board, {
        attempt: 2,
        exit: 'exited',
        turnId: unacknowledged?.turnId ?? '',
    });

    const unchanged = await followUp('again-2');
    expect(sectionHeads(unchanged?.input ?? '')).toEqual([`## Follow-up from @${handle}`]);
    expect(await deliveredRevision(worker.id)).toBe(changed);
});

test('a cloud turn delivers its WORKER.md once the provider accepts the send', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { delivery } = offlineDelivery(connection.db, board.seed);
    const workerMd = await publish(board, `agents/${await agentHandle(board)}/WORKER.md`, 'Rules.');
    const started = await startWorker(connection.db, board.runner, startInput(board), storage);
    if (started.kind !== 'started') {
        throw new Error('held');
    }
    const { worker } = started.receipt;
    const turnId = worker.turns[0]?.turnId ?? '';
    expect(await deliveredRevision(worker.id)).toBeNull();

    await observe(connection.db, delivery, board, {
        status: 'running',
        turnId,
        workerId: worker.id,
    });

    expect(await deliveredRevision(worker.id)).toBe(workerMd);
});

async function publish(board: WorkerBoard, path: string, text: string, base?: string) {
    const published = await publishArtifact({
        actor: { kind: 'agent', runner: board.runner },
        db: connection.db,
        input: {
            ...(base ? { base_revision_id: base } : {}),
            content_type: 'text/markdown',
            path,
            replace: false,
            request_id: `rq_${crypto.randomUUID()}`,
        },
        origin: 'https://app.haus.test',
        storage,
        stream: (async function* () {
            yield new TextEncoder().encode(text);
        })(),
    });
    return published.artifact.revision_id;
}

function sectionHeads(input: string) {
    return input.split('\n').filter((line) => line.startsWith('## '));
}

async function agentHandle(board: WorkerBoard) {
    const [agent] = await connection.db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(eq(agentsTable.id, board.seed.agentId));
    return agent?.handle ?? '';
}

async function deliveredRevision(workerId: string) {
    const [worker] = await connection.db
        .select({ revision: workersTable.workerMdRevisionId })
        .from(workersTable)
        .where(eq(workersTable.id, workerId));
    return worker?.revision;
}

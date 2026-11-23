import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { computersTable } from '../src/postgres/schema.ts';
import { revokeTurnCredentials } from '../src/workers/worker-credentials.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { type WorkerBoard, readTurns, seedWorkerBoard, startOn } from './worker-board.fixture.ts';
import { attachAnotherComputer, setComputerPlace } from './worker-computer-place.fixture.ts';

let harness: HausServerHarness;
let connection: HausConnection;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await harness?.close();
});

async function computerTurn() {
    const board = await seedWorkerBoard(connection.db);
    await setComputerPlace(connection.db, board, board.seed.computerId, { name: 'mini' });
    const { worker } = (await startOn(connection.db, board, { place: 'mini' })).receipt;
    const [turn] = await readTurns(connection.db, worker.id);
    return {
        board,
        credentialHash: await credentialHashOf(board.seed.computerId),
        turnId: turn?.id ?? '',
        workerId: worker.id,
    };
}

test('the launch fence mints for the current attempt and names each reason it refuses', async () => {
    const { board, credentialHash, turnId } = await computerTurn();
    const mint = (attempt = 1, hash = credentialHash) =>
        post('/computer/workers/turn-credential', { attempt, credentialHash: hash, turnId });
    const set = (assignment: ReturnType<typeof sql>) =>
        connection.db.execute(sql`update worker_turns set ${assignment} where id = ${turnId}`);

    const other = await attachAnotherComputer(connection.db, board, { name: 'studio' });
    expect(await mint(1, await credentialHashOf(other))).toMatchObject({
        body: { reason: 'not-dispatched-here', state: 'refused' },
    });
    expect((await mint(1, 'f'.repeat(64))).status).toBe(403);
    expect(await mint(2)).toMatchObject({ body: { reason: 'stale-attempt' } });
    await setComputerPlace(connection.db, board, board.seed.computerId, { enabled: false });
    expect(await mint()).toMatchObject({ body: { reason: 'place-off' } });
    await setComputerPlace(connection.db, board, board.seed.computerId, { name: 'mini' });
    await connection.db.execute(sql`update workers set closing_at = now() where id in (
        select worker_id from worker_turns where id = ${turnId})`);
    expect(await mint()).toMatchObject({ body: { reason: 'closing' } });
    await connection.db.execute(sql`update workers set closing_at = null where id in (
        select worker_id from worker_turns where id = ${turnId})`);
    await set(sql`stop_requested_at = now(), stop_requested_by_agent_id = ${board.seed.agentId}`);
    expect(await mint()).toMatchObject({ body: { reason: 'stop-requested' } });
    await set(sql`stop_requested_at = null, stop_requested_by_agent_id = null`);
    expect(await mint()).toMatchObject({ body: { attempt: 1, state: 'minted', turnId } });
    await set(sql`outcome = '{"kind":"stopped"}'::jsonb`);
    expect(await mint()).toMatchObject({ body: { reason: 'settled', state: 'refused' } });
});

test('a re-mint for the same attempt revokes the earlier token, and settling revokes the rest', async () => {
    const { credentialHash, turnId } = await computerTurn();
    const mint = async () =>
        (await post('/computer/workers/turn-credential', { attempt: 1, credentialHash, turnId }))
            .body.token as string;
    const report = (token: string) =>
        post('/api/worker/report', { outcome: 'done', text: 'Done.' }, token);
    const first = await mint();
    const second = await mint();

    expect((await report(first)).status).toBe(401);
    expect(await report(second)).toMatchObject({
        body: { draft: { outcome: 'done', text: 'Done.' }, turnId },
        status: 200,
    });
    await connection.db.execute(
        sql`update worker_turns set outcome = '{"kind":"stopped"}'::jsonb where id = ${turnId}`
    );
    const [turn] = await connection.db.execute(
        sql`select server_id from worker_turns where id = ${turnId}`
    );
    await revokeTurnCredentials(connection.db, String(turn?.server_id), [turnId]);
    expect(await report(second)).toMatchObject({
        body: { code: 'WORKER_TURN_SETTLED' },
        status: 409,
    });
});

test('the turn token reaches only report and the Drive reads; the push token only pushes and reads', async () => {
    const { credentialHash, turnId } = await computerTurn();
    const turnToken = (
        await post('/computer/workers/turn-credential', { attempt: 1, credentialHash, turnId })
    ).body.token as string;
    const pushToken = (await post('/computer/workers/push-credential', { credentialHash, turnId }))
        .body.token as string;
    const allowed = new Set([
        'POST /api/worker/report',
        'GET /api/agent/drive/changes',
        'GET /api/agent/artifacts/by-path',
        'GET /api/agent/artifacts/:artifactId/download',
    ]);
    const routes = harness
        .routes()
        .filter(({ url }) => url.startsWith('/api/agent/') || url.startsWith('/computer/'));
    const reached: string[] = [];
    for (const { method, url } of routes) {
        const key = `${method} ${url}`;
        if (allowed.has(key)) {
            continue;
        }
        const response = await send(method, url.replaceAll(/:[A-Za-z]+/gu, 'x'), turnToken);
        if (response.status < 400) {
            reached.push(key);
        }
    }

    expect(routes.length).toBeGreaterThan(50);
    expect(reached).toEqual([]);
    expect((await send('GET', '/api/agent/drive/changes', turnToken)).status).toBe(200);
    expect(
        (await send('GET', '/api/agent/artifacts/by-path?path=agents/none.md', turnToken)).status
    ).toBe(404);
    expect((await post('/api/agent/drive/push/close', { push_id: turnId }, turnToken)).status).toBe(
        401
    );
    expect(
        (await post('/api/worker/report', { outcome: 'done', text: 'x' }, pushToken)).status
    ).toBe(401);
    expect(await post('/api/agent/drive/push/close', { push_id: turnId }, pushToken)).toMatchObject(
        {
            body: { listed: [] },
            status: 200,
        }
    );
    expect((await send('GET', '/api/agent/drive/changes', pushToken)).status).toBe(200);
});

test('a report validates its ask and person, lists the followers it can name, and replaces the draft', async () => {
    const { board, credentialHash, turnId } = await computerTurn();
    const token = (
        await post('/computer/workers/turn-credential', { attempt: 1, credentialHash, turnId })
    ).body.token as string;
    const report = (body: object) => post('/api/worker/report', body, token);
    const handle = await humanHandle(board);
    await connection.db.execute(sql`
        insert into task_follows (server_id, task_chat_id, user_id)
        values (${board.seed.serverId}, ${board.task.chatId}, ${board.seed.userId})
        on conflict do nothing
    `);

    expect((await report({ outcome: 'needs-you', text: 'Stuck.' })).status).toBe(400);
    expect(
        await report({ ask: 'Which key?', outcome: 'needs-you', person: 'nobody', text: 'Stuck.' })
    ).toMatchObject({
        body: {
            code: 'WORKER_PERSON_UNKNOWN',
            message: `@nobody is not a person who can read this Task. Its followers: @${handle}.`,
        },
    });
    await report({ outcome: 'done', text: 'First.' });
    expect(
        await report({ ask: 'Which key?', outcome: 'needs-you', person: handle, text: 'Stuck.' })
    ).toMatchObject({
        body: {
            draft: {
                ask: 'Which key?',
                outcome: 'needs-you',
                personId: board.seed.userId,
                pullRequestUrls: [],
                text: 'Stuck.',
            },
        },
        status: 200,
    });
    await connection.db.execute(sql`update workers set closing_at = now() where id in (
        select worker_id from worker_turns where id = ${turnId})`);
    expect(await report({ outcome: 'done', text: 'Late.' })).toMatchObject({
        body: { code: 'WORKER_CLOSED' },
    });
    const [turn] = await readTurns(connection.db, (await workerOf(turnId)) ?? '');
    expect(turn?.reportDraft?.text).toBe('Stuck.');
});

async function post(path: string, body: object, token?: string) {
    const response = await fetch(new URL(path, harness.url), {
        body: JSON.stringify(body),
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        method: 'POST',
    });
    return { body: await response.json(), status: response.status };
}

async function send(method: string, path: string, token: string) {
    const response = await fetch(new URL(path, harness.url), {
        ...(method === 'GET' || method === 'DELETE'
            ? {}
            : { body: '{}', headers: { 'content-type': 'application/json' } }),
        headers: {
            authorization: `Bearer ${token}`,
            ...(method === 'GET' || method === 'DELETE'
                ? {}
                : { 'content-type': 'application/json' }),
        },
        method,
    });
    await response.arrayBuffer();
    return response;
}

async function credentialHashOf(computerId: string) {
    const [computer] = await connection.db
        .select({ hash: computersTable.credentialHash })
        .from(computersTable)
        .where(eq(computersTable.id, computerId));
    return computer?.hash ?? '';
}

async function humanHandle(board: WorkerBoard) {
    const [row] = await connection.db.execute(
        sql`select handle from server_memberships where user_id = ${board.seed.userId}`
    );
    return String(row?.handle);
}

async function workerOf(turnId: string) {
    const [row] = await connection.db.execute(
        sql`select worker_id from worker_turns where id = ${turnId}`
    );
    return row?.worker_id as string | undefined;
}

import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('a repeated dispatch replays the stored receipt and creates one channel', async () => {
    const runner = await fixture.mintRunner('run_dispatch_repeat');
    const dispatchId = `${runner.runId}:toolu_repeat:0`;
    const body = { humans: ['@ada'], name: 'launch-repeat' };

    const first = await createChannel(runner, dispatchId, body);
    const repeat = await createChannel(runner, dispatchId, body);
    const undispatched = await createChannel(runner, null, body);

    expect(first).toEqual({
        body: { description: null, humans: ['ada'], target: '#launch-repeat' },
        status: 200,
    });
    expect(repeat).toEqual(first);
    expect(undispatched).toMatchObject({ body: { code: 'CHANNEL_NAME_TAKEN' }, status: 409 });
    expect(await channelCount('launch-repeat')).toBe(1);
    expect(await dispatchRows(dispatchId)).toEqual([
        { response_status: 200, route: '/api/agent/channels/create', state: 'finished' },
    ]);
});

test('a dispatch id reused for a different body is refused without running', async () => {
    const runner = await fixture.mintRunner('run_dispatch_reuse');
    const dispatchId = `${runner.runId}:toolu_reuse:0`;
    await createChannel(runner, dispatchId, { humans: ['@ada'], name: 'launch-reuse' });

    const reused = await createChannel(runner, dispatchId, {
        humans: ['@ada'],
        name: 'launch-other',
    });

    expect(reused).toMatchObject({ body: { code: 'IDEMPOTENCY_KEY_REUSED' }, status: 409 });
    expect(await channelCount('launch-other')).toBe(0);
});

test('concurrent repeats of one dispatch create once and answer both with the same body', async () => {
    const runner = await fixture.mintRunner('run_dispatch_race');
    const dispatchId = `${runner.runId}:toolu_race:0`;
    const body = { humans: ['@ada'], name: 'launch-race' };

    const [left, right] = await Promise.all([
        createChannel(runner, dispatchId, body),
        createChannel(runner, dispatchId, body),
    ]);

    expect(left).toEqual({
        body: { description: null, humans: ['ada'], target: '#launch-race' },
        status: 200,
    });
    expect(right).toEqual(left);
    expect(await channelCount('launch-race')).toBe(1);
    expect(await dispatchRows(dispatchId)).toHaveLength(1);
});

test('a dispatch left accepted by a dead Server answers outcome unknown and never runs', async () => {
    const runner = await fixture.mintRunner('run_dispatch_crash');
    const dispatchId = `${runner.runId}:toolu_crash:0`;
    await fixture.harness.sql`
        insert into agent_dispatches (
            id, server_id, agent_id, run_id, dispatch_id, route, request_fingerprint, state,
            accepted_at
        ) values (
            ${'adp_crashedcrashed00'}, ${fixture.serverId}, ${fixture.orbitAgentId},
            ${runner.runId}, ${dispatchId}, '/api/agent/channels/create', 'before-the-crash',
            'accepted', now()
        )
    `;
    const body = { humans: ['@ada'], name: 'launch-crash' };

    const first = await createChannel(runner, dispatchId, body);
    const again = await createChannel(runner, dispatchId, body);

    expect(first).toMatchObject({ body: { code: 'DISPATCH_OUTCOME_UNKNOWN' }, status: 409 });
    expect(again).toEqual(first);
    expect(await channelCount('launch-crash')).toBe(0);
    expect(await dispatchRows(dispatchId)).toEqual([
        { response_status: null, route: '/api/agent/channels/create', state: 'unknown' },
    ]);
});

test('read routes ignore the header, even a malformed one', async () => {
    const runner = await fixture.mintRunner('run_dispatch_read');
    const read = async (dispatchId: string | null) => {
        const response = await fetch(
            new URL('/api/agent/channels/info?target=%23product', fixture.harness.url),
            { headers: headersFor(runner, dispatchId) }
        );
        return { body: await response.json(), status: response.status };
    };

    const plain = await read(null);

    expect(plain.status).toBe(200);
    expect(await read('not a dispatch id')).toEqual(plain);
    expect(await read(`${runner.runId}:toolu_read:0`)).toEqual(plain);
    expect(await dispatchRows(`${runner.runId}:toolu_read:0`)).toEqual([]);
});

test('a malformed header or another run id is refused before anything runs', async () => {
    const runner = await fixture.mintRunner('run_dispatch_owner');
    const body = { humans: ['@ada'], name: 'launch-foreign' };

    const malformed = await createChannel(runner, `${runner.runId}:toolu_bad:01`, body);
    const foreign = await createChannel(runner, 'run_someone_else:toolu_foreign:0', body);

    expect(malformed).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
    expect(foreign).toMatchObject({ body: { code: 'DISPATCH_RUN_MISMATCH' }, status: 403 });
    expect(await channelCount('launch-foreign')).toBe(0);
    expect(await dispatchRows('run_someone_else:toolu_foreign:0')).toEqual([]);
});

async function createChannel(
    runner: { token: string },
    dispatchId: string | null,
    body: Record<string, unknown>
) {
    const response = await fetch(new URL('/api/agent/channels/create', fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { ...headersFor(runner, dispatchId), 'content-type': 'application/json' },
        method: 'POST',
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

function headersFor(runner: { token: string }, dispatchId: string | null) {
    return {
        authorization: `Bearer ${runner.token}`,
        ...(dispatchId === null ? {} : { 'haus-dispatch-id': dispatchId }),
    };
}

async function channelCount(name: string) {
    const [row] = (await fixture.harness.sql`
        select count(*)::int as count from chats
        where server_id = ${fixture.serverId} and kind = 'channel' and name = ${name}
    `) as Array<{ count: number }>;
    return row?.count;
}

async function dispatchRows(dispatchId: string) {
    return (await fixture.harness.sql`
        select state, route, response_status from agent_dispatches
        where server_id = ${fixture.serverId} and dispatch_id = ${dispatchId}
    `) as Array<{ response_status: number | null; route: string; state: string }>;
}

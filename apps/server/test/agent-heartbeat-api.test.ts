import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('a report is accepted once per heartbeat or nightly run and refused elsewhere', async () => {
    const chatRun = await startRun('run_hbreport_chat001', 'human');
    const refused = await call('POST', '/api/agent/heartbeat/report', chatRun, { text: 'hi' });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'HEARTBEAT_RUN_REQUIRED' });

    const unknown = await mintOnly('run_hbreport_unknown1');
    expect(
        (await call('POST', '/api/agent/heartbeat/report', unknown, { text: 'hi' })).status
    ).toBe(403);

    const heartbeat = await startRun('run_hbreport_day0001', 'heartbeat');
    const filed = await call('POST', '/api/agent/heartbeat/report', heartbeat, {
        text: 'Q4 budget thread is stuck on legal.',
    });
    expect(filed.status).toBe(200);
    expect(filed.body).toEqual({ queued: true });
    const rows = await fixture.harness.sql`
        select chat_id, content, dedupe_key, source from agent_inbox
        where agent_id = ${fixture.orbitAgentId} and source = 'heartbeat_report'
    `;
    expect(rows).toEqual([
        {
            chat_id: null,
            content: 'Q4 budget thread is stuck on legal.',
            dedupe_key: 'heartbeat-report:run_hbreport_day0001',
            source: 'heartbeat_report',
        },
    ]);

    const second = await call('POST', '/api/agent/heartbeat/report', heartbeat, { text: 'again' });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: 'HEARTBEAT_REPORT_EXISTS' });

    const nightly = await startRun('run_hbreport_night001', 'dream');
    expect(
        (await call('POST', '/api/agent/heartbeat/report', nightly, { text: 'Night.' })).status
    ).toBe(200);

    const invalid = await call('POST', '/api/agent/heartbeat/report', heartbeat, { text: '' });
    expect(invalid.status).toBe(400);
    expect((await call('POST', '/api/agent/heartbeat/report', null, { text: 'x' })).status).toBe(
        401
    );
});

test('learned is stored by run id, only from a nightly run, and replaced on repeat', async () => {
    const heartbeat = await startRun('run_hblearned_day001', 'heartbeat');
    const refused = await call('POST', '/api/agent/heartbeat/learned', heartbeat, { text: 'x' });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'DREAM_RUN_REQUIRED' });

    const nightly = await startRun('run_hblearned_night01', 'dream');
    await call('POST', '/api/agent/heartbeat/learned', nightly, { text: 'First draft.' });
    const saved = await call('POST', '/api/agent/heartbeat/learned', nightly, {
        text: 'Ramp plan moved to Q1.',
    });
    expect(saved.body).toEqual({ saved: true });
    const rows = await fixture.harness.sql`
        select run_id, agent_id, summary from agent_dream_summaries
        where run_id = 'run_hblearned_night01'
    `;
    expect(rows).toEqual([
        {
            agent_id: fixture.orbitAgentId,
            run_id: 'run_hblearned_night01',
            summary: 'Ramp plan moved to Q1.',
        },
    ]);
});

async function startRun(runId: string, source: string) {
    await fixture.harness.sql`
        insert into agent_run_triggers (server_id, agent_id, run_id, source, work_id, chat_id)
        values (${fixture.serverId}, ${fixture.orbitAgentId}, ${runId}, ${source},
            ${`work:${runId}`}, ${source === 'human' ? fixture.channelId : null})
    `;
    return await mintOnly(runId);
}

async function mintOnly(runId: string, agentId = fixture.orbitAgentId) {
    return await fixture.mintRunner(runId, agentId, undefined, false);
}

async function call(
    method: 'GET' | 'POST',
    path: string,
    runner: { token: string } | null,
    body?: unknown
) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
            ...(runner ? { authorization: `Bearer ${runner.token}` } : {}),
            'content-type': 'application/json',
        },
        method,
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

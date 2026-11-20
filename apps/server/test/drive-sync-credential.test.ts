import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { revokeRunnerCredentialsForRun } from '../src/computers/runner-credentials.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { type InvocationHarness, startInvocationHarness } from './agent-invocations.fixture.ts';

let setup: InvocationHarness;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'drive-sync-credential' });
});

afterAll(async () => {
    await setup?.close();
});

test('a drive-sync credential reaches the Drive sync routes, nothing else, for 15 minutes', async () => {
    const minted = await fetch(new URL('/computer/runner/mint', setup.harness.url), {
        body: JSON.stringify({
            agentId: setup.agentId,
            chatId: null,
            credentialHash: createHash('sha256').update(setup.computerCredential).digest('hex'),
            purpose: 'drive-sync',
            runId: 'run_drive_sync_scope',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const { runnerId, runnerToken } = (await minted.json()) as {
        runnerId: string;
        runnerToken: string;
    };
    const get = (path: string) =>
        fetch(new URL(path, setup.harness.url), {
            headers: { authorization: `Bearer ${runnerToken}` },
        });

    expect((await get('/api/agent/drive/changes')).status).not.toBe(401);
    expect((await get('/api/agent/server')).status).toBe(401);
    expect((await get('/api/agent/history')).status).toBe(401);
    expect((await get('/api/agent/reminders')).status).toBe(401);
    const schedule = await fetch(new URL('/api/agent/reminders/schedule', setup.harness.url), {
        body: JSON.stringify({}),
        headers: { authorization: `Bearer ${runnerToken}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(schedule.status).toBe(401);
    const [row] = (await setup.harness.sql`
        select capabilities, round(extract(epoch from expires_at - created_at)) as lifetime_seconds
        from agent_runner_credentials where id = ${runnerId}
    `) as { capabilities: string[]; lifetime_seconds: string }[];
    expect(row).toEqual({ capabilities: ['drive-sync'], lifetime_seconds: '900' });

    const connection = await connectHausDatabase(setup.harness.databaseUrl);
    await revokeRunnerCredentialsForRun(connection.db, {
        agentId: setup.agentId,
        runId: 'run_drive_sync_scope',
        serverId: setup.serverId,
    });
    await connection.close();
    expect((await get('/api/agent/drive/changes')).status).not.toBe(401);
});

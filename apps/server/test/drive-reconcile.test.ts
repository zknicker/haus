import { afterAll, beforeAll, expect, test } from 'bun:test';
import { driveReconcileFrames } from '../src/agent-delivery/drive-reconcile.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { type InvocationHarness, startInvocationHarness } from './agent-invocations.fixture.ts';

let setup: InvocationHarness;
let connection: Awaited<ReturnType<typeof connectHausDatabase>>;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'drive-reconcile' });
    connection = await connectHausDatabase(setup.harness.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await setup?.close();
});

test('a reconnect pushes under the last dispatched run, never under a later idle compaction', async () => {
    await recordTurn('run_reconcile_real', 'atn_reconcilereal001', '2026-11-24T22:00:00Z');
    await setup.harness.sql`
        insert into agent_run_triggers (server_id, agent_id, run_id, source, work_id)
        values (${setup.serverId}, ${setup.agentId}, 'run_reconcile_real', 'drive_conflict', 'drc_1')
    `;
    await recordTurn('compaction-reconcile', 'atn_reconcilecomp001', '2026-11-24T23:00:00Z');

    expect(await driveReconcileFrames(connection.db, setup.computerId)).toEqual([
        {
            agentId: setup.agentId,
            placementGeneration: 0,
            runId: 'run_reconcile_real',
            sessionGeneration: expect.any(Number),
            type: 'drive-push',
        },
    ]);
});

test('a reconnect sends no push for a run whose push already closed', async () => {
    await setup.harness.sql`
        insert into drive_pushes (server_id, agent_id, id, closed_at)
        values (${setup.serverId}, ${setup.agentId}, 'run_reconcile_real', now())
    `;

    expect(await driveReconcileFrames(connection.db, setup.computerId)).toEqual([]);
});

async function recordTurn(runId: string, id: string, endedAt: string) {
    await setup.harness.sql`
        insert into agent_turns (id, server_id, agent_id, computer_id, run_id, started_at, ended_at, status, summary)
        values (
            ${id}, ${setup.serverId}, ${setup.agentId}, ${setup.computerId}, ${runId},
            ${endedAt}, ${endedAt}, 'completed', ''
        )
    `;
}

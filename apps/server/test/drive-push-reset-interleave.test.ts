import { afterAll, beforeAll, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { recordRunTrigger } from '../src/server-agents/record-agent-turn.ts';
import { drivePushFixture } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;
let connection: HausConnection;
beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});
afterAll(async () => {
    await connection.close();
});

test('reset order, not transaction start time, decides which runs may push', async () => {
    const old = await push.dispatch('run_old');
    await push.putOutcome(
        old,
        { path: 'agents/orbit/notes/old.md', push_id: 'run_old', request_id: 'interleave-old' },
        'old\n'
    );

    const lateStarted = Promise.withResolvers<void>();
    const lateGo = Promise.withResolvers<void>();
    const late = connection.db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        lateStarted.resolve();
        await lateGo.promise;
        await recordRunTrigger(
            tx,
            { agentId: fixture.orbitAgentId, runId: 'run_late', serverId: fixture.serverId },
            { chatId: fixture.channelId, dedupeKey: 'wake_run_late', source: 'chat' }
        );
    });
    await lateStarted.promise;

    const held = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const serverLock = fixture.harness.sql.begin(async (tx) => {
        await tx`select id from servers where id = ${fixture.serverId} for update`;
        held.resolve();
        await release.promise;
    });
    await held.promise;
    const reset = fixture.owner.trpc.agent.reset.mutate({
        agentId: fixture.orbitAgentId,
        kind: 'full',
        serverId: fixture.serverId,
    });
    reset.catch(() => undefined);
    let stale: ReturnType<typeof push.putOutcome> = Promise.resolve(null as never);
    try {
        await waitForLockWaiters(1);
        stale = push.putOutcome(
            old,
            {
                path: 'agents/orbit/notes/old.md',
                push_id: 'run_old',
                request_id: 'interleave-stale',
            },
            'stale edit\n'
        );
        stale.catch(() => undefined);
        await waitForLockWaiters(2);
    } finally {
        release.resolve();
        await serverLock;
    }
    await reset;
    expect(await stale).toMatchObject({ code: 'AGENT_RESET', outcome: 'refused' });

    lateGo.resolve();
    await late;
    const lateRunner = await fixture.mintRunner(
        'run_late',
        fixture.orbitAgentId,
        fixture.channelId,
        false
    );
    expect(
        await push.putOutcome(
            lateRunner,
            {
                path: 'agents/orbit/notes/late.md',
                push_id: 'run_late',
                request_id: 'interleave-late',
            },
            'fresh\n'
        )
    ).toMatchObject({ outcome: 'committed', path: 'agents/orbit/notes/late.md' });
});

async function waitForLockWaiters(count: number) {
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
        const [row] = (await fixture.harness.sql`
            select count(*)::int as waiting from pg_stat_activity
            where datname = current_database()
              and pid <> pg_backend_pid()
              and wait_event_type = 'Lock'
        `) as { waiting: number }[];
        if ((row?.waiting ?? 0) >= count) {
            return;
        }
    }
    throw new Error(`Fewer than ${count} writers reached the held Server lock.`);
}

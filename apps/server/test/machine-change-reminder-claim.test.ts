import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { claimReminderScript } from '../src/reminders/reminder-script-placement.ts';
import {
    attachComputer,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import { seedScriptFire } from './agent-machine.fixture.ts';

const laptopId = `cmp_${'c'.repeat(16)}`;
let setup: InvocationHarness;
let connection: HausConnection;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'machine-claim' });
    await attachComputer(setup, { id: laptopId, name: 'MacBook' });
    connection = await connectHausDatabase(setup.harness.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await setup?.close();
});

test('a dispatch decided before a Machine change cannot bind its fire to the old Machine', async () => {
    const attentionId = await seedScriptFire(setup, { key: 'before' });
    await moveTo(laptopId);

    expect(
        await claimReminderScript(connection.db, { attentionId, computerId: setup.computerId })
    ).toBeNull();
    expect(await binding(attentionId)).toEqual([{ computer: null, generation: null }]);

    expect(
        await claimReminderScript(connection.db, { attentionId, computerId: laptopId })
    ).toMatchObject({ fresh: true, placementGeneration: 1 });
    expect(await binding(attentionId)).toEqual([{ computer: laptopId, generation: 1 }]);
});

test('a claim racing a Machine change ends bound to the current placement or fenced, never stranded', async () => {
    const attentionId = await seedScriptFire(setup, { key: 'race' });

    await Promise.all([
        claimReminderScript(connection.db, { attentionId, computerId: laptopId }),
        moveTo(setup.computerId),
    ]);

    const [agent] = (await setup.harness.sql`
        select computer_id, placement_generation from agents where id = ${setup.agentId}
    `) as { computer_id: string; placement_generation: number }[];
    const rows = await binding(attentionId);
    expect(
        rows.every(
            (row) =>
                row.computer === null ||
                (row.computer === agent?.computer_id &&
                    row.generation === agent?.placement_generation)
        )
    ).toBe(true);
});

async function moveTo(computerId: string) {
    await setup.owner.trpc.agent.setMachine.mutate({
        agentId: setup.agentId,
        computerId,
        fromLastSynced: true,
        serverId: setup.serverId,
    });
}

async function binding(attentionId: string) {
    return (await setup.harness.sql`
        select dispatched_computer_id as computer, dispatched_placement_generation as generation
        from reminder_agent_attention where id = ${attentionId}
    `) as { computer: string | null; generation: number | null }[];
}

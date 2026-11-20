import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mapAgentsOntoCatalog, moveAgentsToRunner } from '../src/agent-delivery/runner-cutover.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { type InvocationHarness, startInvocationHarness } from './agent-invocations.fixture.ts';

let setup: InvocationHarness;
let connection: HausConnection;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'runner-cutover' });
    connection = await connectHausDatabase(setup.harness.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await setup?.close();
});

const agentRow = async () => {
    const [row] = (await setup.harness.sql`
        select session_generation, session_reset_kind, desired_runtime_id, desired_model_id,
               desired_reasoning_effort
        from agents where id = ${setup.agentId}
    `) as Record<string, unknown>[];
    return row;
};

test('the cutover gives every live Agent one fresh runner session, once', async () => {
    await setup.harness.sql`delete from boot_steps where name = 'agents-move-to-runner'`;
    const before = Number((await agentRow())?.session_generation);

    expect(await moveAgentsToRunner(connection.db)).toBe(1);
    expect(await moveAgentsToRunner(connection.db)).toBe(0);

    expect(await agentRow()).toMatchObject({
        session_generation: before + 1,
        session_reset_kind: 'session',
    });
    const rotations = (await setup.harness.sql`
        select reason from agent_session_rotations where agent_id = ${setup.agentId}
    `) as { reason: string }[];
    expect(rotations.map((rotation) => rotation.reason)).toEqual(['runner']);
});

test('an Agent on a model the runner catalog drops moves to its provider first model', async () => {
    await mapAgentsOntoCatalog(connection.db, [
        {
            id: 'codex',
            label: 'ChatGPT',
            models: [
                { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', reasoningEfforts: ['low', 'high'] },
            ],
        },
    ]);

    expect(await agentRow()).toMatchObject({
        desired_model_id: 'gpt-6.1-sol',
        desired_reasoning_effort: 'high',
        desired_runtime_id: 'codex',
    });
});

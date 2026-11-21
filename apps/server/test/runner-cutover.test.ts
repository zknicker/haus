import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    awaitsCutover,
    mapAgentsOntoCatalog,
    moveAgentsToRunner,
} from '../src/agent-delivery/runner-cutover.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { type InvocationHarness, startInvocationHarness } from './agent-invocations.fixture.ts';
import { reportRunnerModels, testRunnerRuntimes } from './runner.fixture.ts';

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

const rotationReasons = async () => {
    const rows = (await setup.harness.sql`
        select reason from agent_session_rotations where agent_id = ${setup.agentId}
    `) as { reason: string }[];
    return rows.map((row) => row.reason);
};

const xaiRuntimes = [
    ...testRunnerRuntimes,
    { id: 'pi', label: 'Pi', models: [{ id: 'grok-4.3', label: 'Grok 4.3' }] },
];

test('a Server with no model login strands no Agent silently: it keeps its session and waits', async () => {
    await setup.harness.sql`delete from boot_steps`;
    await setup.harness.sql`
        update agents set desired_runtime_id = 'pi', desired_model_id = 'grok-4.3'
        where id = ${setup.agentId}
    `;
    const before = await agentRow();

    await reportRunnerModels(setup.harness, { runtimes: xaiRuntimes });

    expect(await moveAgentsToRunner(connection.db)).toEqual({ moved: 0, stranded: 1 });
    expect(await agentRow()).toMatchObject({ session_generation: before?.session_generation });
    expect(await rotationReasons()).toEqual([]);
    expect(await awaitsCutover(connection.db, setup.agentId)).toBe(true);
    const steps = (await setup.harness.sql`select name from boot_steps`) as { name: string }[];
    expect(steps.map((step) => step.name).sort()).toEqual([
        'agents-mapped-onto-runner-catalog',
        'agents-move-to-runner-began',
    ]);
});

test('a waiting Agent switched to a provider its Server has a login for moves on the next sweep', async () => {
    await setup.owner.trpc.modelConnections.add.mutate({
        credential: { kind: 'setup-token', token: 'sk-ant-oat01-cutover-switch' },
        label: 'Claude',
        provider: 'claude',
        serverId: setup.serverId,
    });
    expect(await awaitsCutover(connection.db, setup.agentId)).toBe(true);

    await setup.owner.trpc.agent.configure.mutate({
        agentId: setup.agentId,
        modelId: 'claude-opus',
        runtimeId: 'claude',
        serverId: setup.serverId,
    });

    await moveAgentsToRunner(connection.db);
    expect(await rotationReasons()).toContain('runner');
    expect(await awaitsCutover(connection.db, setup.agentId)).toBe(false);
});

test('connecting the model login later moves the waiting Agent to a fresh runner session', async () => {
    await setup.harness.sql`
        update agents set desired_runtime_id = 'pi', desired_model_id = 'grok-4.3'
        where id = ${setup.agentId}
    `;
    await setup.harness
        .sql`delete from boot_steps where name <> 'agents-mapped-onto-runner-catalog'`;
    await setup.harness.sql`delete from agent_session_rotations where agent_id = ${setup.agentId}`;
    expect(await moveAgentsToRunner(connection.db)).toEqual({ moved: 0, stranded: 1 });
    const before = Number((await agentRow())?.session_generation);

    await setup.owner.trpc.modelConnections.add.mutate({
        credential: { key: 'xai-cutover-api-key', kind: 'api-key' },
        label: 'xAI key',
        provider: 'xai',
        serverId: setup.serverId,
    });

    expect(await rotationReasons()).toEqual(['runner']);
    expect(await agentRow()).toMatchObject({
        session_generation: before + 1,
        session_reset_kind: 'session',
    });
    expect(await awaitsCutover(connection.db, setup.agentId)).toBe(false);
    expect(await moveAgentsToRunner(connection.db)).toEqual({ moved: 0, stranded: 0 });
});

test('an Agent on a model the runner catalog drops moves to its provider first model', async () => {
    await setup.harness.sql`
        update agents set desired_runtime_id = 'codex', desired_model_id = 'gpt-5.6-sol'
        where id = ${setup.agentId}
    `;
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

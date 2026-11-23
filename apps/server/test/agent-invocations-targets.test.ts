import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    attachComputer,
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    invocationRequest,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import { harnessAppOrigin } from './haus-server-harness.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const laptopId = 'cmp_invtargetslaptop';
let setup: InvocationHarness;
let runner: RunnerClient;
let studio: FrameClient;
let laptop: FrameClient;
let laptopCredential: string;
let link: string;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'invocation-targets' });
    await setup.harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    laptopCredential = await attachComputer(setup, { id: laptopId, name: 'Laptop' });
    link = `${harnessAppOrigin}/s/invocation-targets/settings/computers/${laptopId}`;
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    studio = await connectComputer(setup.harness, setup.computerCredential);
    laptop = await connectComputer(setup.harness, laptopCredential);
    await setup.owner.trpc.computer.grantAgentAccess.mutate({
        agentId: setup.agentId,
        computerId: laptopId,
        serverId: setup.serverId,
    });
});

afterAll(async () => {
    runner?.close();
    studio?.close();
    laptop?.close();
    await setup?.close();
});

test('a call with no target runs on the home Computer and its result is unchanged', async () => {
    runner.send(invocationRequest(setup.agentId, 'run_home', 'toolu_home'));
    await finish(studio, 'run_home', 'home ok');
    expect((await answerFor('toolu_home')).output).toEqual({ kind: 'text', text: 'home ok' });
    expect(laptop.frames.filter((frame) => frame.runId === 'run_home')).toEqual([]);
});

test('a call that names a Computer by name or id runs there and its result names it', async () => {
    for (const [runId, computer] of [
        ['run_name', 'LAPTOP'],
        ['run_id', laptopId],
        ['run_prefixed', `computer:${laptopId}`],
    ] as const) {
        call(runId, computer);
        await finish(laptop, runId, 'hi');
        expect((await answerFor(runId)).output).toEqual({
            kind: 'text',
            text: '[Ran on Laptop]\nhi',
        });
    }
    call('run_home_by_name', 'studio');
    await finish(studio, 'run_home_by_name', 'home ok');
    expect((await answerFor('run_home_by_name')).output).toEqual({
        kind: 'text',
        text: 'home ok',
    });
    expect(await ledger('run_id')).toEqual([
        { computer_id: laptopId, outcome: 'completed', refusal: null, state: 'finished' },
    ]);
});

test('an unknown Computer refuses not-found, records no Computer, and replays the same text', async () => {
    call('run_unknown', 'nowhere');
    const first = await answerFor('run_unknown');
    expect(first).toMatchObject({ outcome: 'failed' });
    expect(textOf(first)).toBe(
        'No Computer on this Server matches that `computer`, so nothing ran. Run `haus computer list` to see each Computer’s id and name, or leave `computer` out to run on your home Computer.'
    );
    expect(await ledger('run_unknown')).toEqual([
        { computer_id: null, outcome: 'failed', refusal: 'not-found', state: 'finished' },
    ]);
    expect(textOf(await replay('run_unknown', 'nowhere'))).toBe(textOf(first));
});

test('a name several Computers share refuses with their ids and never falls back to the home', async () => {
    const twin = 'cmp_invtargetsdouble';
    await attachComputer(setup, { health: 'offline', id: twin, name: 'laptop' });
    call('run_ambiguous', 'Laptop');
    expect(textOf(await answerFor('run_ambiguous'))).toBe(
        `More than one Computer has that name, so nothing ran: ${[laptopId, twin].sort().join(', ')}. Call again with one of these ids as \`computer\`; \`haus computer list\` shows which is which.`
    );
    expect(await ledger('run_ambiguous')).toEqual([
        { computer_id: null, outcome: 'failed', refusal: 'not-found', state: 'finished' },
    ]);
    expect([...studio.frames, ...laptop.frames].filter((f) => f.runId === 'run_ambiguous')).toEqual(
        []
    );
    await setup.harness.sql`delete from computers where id = ${twin}`;
});

test('desktop for a borrowed Agent: all means home Agents only, and naming it lets it in', async () => {
    await setup.harness.sql`
        update computers set computer_use_enabled = true, computer_use_scope = 'all',
            computer_use_changed_at = now()
        where id = ${laptopId}
    `;
    desktop('run_borrowed', laptopId);
    const refused = await answerFor('run_borrowed');
    expect(refused).toMatchObject({ outcome: 'failed' });
    expect(textOf(refused)).toStartWith(
        `Computer use on Laptop isn't allowed for Orbit. @ada, or an Owner or Admin, can add Orbit in Settings → Devices → Laptop (${link}).`
    );
    expect(await ledger('run_borrowed')).toEqual([
        { computer_id: laptopId, outcome: 'failed', refusal: 'not-listed', state: 'finished' },
    ]);
    expect(textOf(await replay('run_borrowed', laptopId, 'desktop'))).toBe(textOf(refused));

    await setup.harness
        .sql`update computers set computer_use_scope = 'named' where id = ${laptopId}`;
    await setup.harness.sql`
        insert into computer_use_agents (server_id, computer_id, agent_id)
        values (${setup.serverId}, ${laptopId}, ${setup.agentId})
    `;
    desktop('run_named', laptopId);
    await finish(laptop, 'run_named', 'snapshot');
    expect(textOf(await answerFor('run_named'))).toBe('[Ran on Laptop]\nsnapshot');
});

test('an offline target answers offline naming it, and replays the same text', async () => {
    laptop.close();
    await laptop.closed;
    call('run_offline', 'laptop');
    const first = await answerFor('run_offline');
    expect(first).toMatchObject({ outcome: 'offline' });
    expect(textOf(first)).toBe(
        'Laptop is offline. Nothing ran. `haus` and `execute` still work, and `haus computer list` shows which Computers are online.'
    );
    expect(await ledger('run_offline')).toEqual([
        { computer_id: laptopId, outcome: 'offline', refusal: null, state: 'finished' },
    ]);
    expect(textOf(await replay('run_offline', 'laptop'))).toBe(textOf(first));
    laptop = await connectComputer(setup.harness, laptopCredential);
});

function call(runId: string, computer: string, kind: 'bash' | 'desktop' = 'bash') {
    runner.send({
        ...invocationRequest(setup.agentId, runId, runId),
        computer,
        ...(kind === 'desktop' ? { operation: { args: ['snapshot'], kind: 'desktop' } } : {}),
    });
}

function desktop(runId: string, computer: string) {
    call(runId, computer, 'desktop');
}

async function replay(runId: string, computer: string, kind: 'bash' | 'desktop' = 'bash') {
    const seen = runner.frames.filter((frame) => frame.toolCallId === runId).length;
    call(runId, computer, kind);
    return await runner.next(
        (frame) =>
            frame.type === 'invocation-result' &&
            runner.frames.filter((candidate) => candidate.toolCallId === runId).length === seen + 1
    );
}

async function finish(computer: FrameClient, runId: string, text: string) {
    const invoke = await computer.next(frameOfType('invoke', { runId }));
    computer.send({
        invocationId: invoke.invocationId,
        outcome: 'completed',
        output: { kind: 'text', text },
        truncated: false,
        type: 'invoke-result',
    });
}

async function answerFor(toolCallId: string) {
    return await runner.next(frameOfType('invocation-result', { toolCallId }));
}

function textOf(answer: Record<string, unknown>) {
    return (answer.output as { text: string }).text;
}

async function ledger(runId: string) {
    return await setup.harness.sql`
        select computer_id, state, outcome, refusal from agent_invocations where run_id = ${runId}
    `;
}

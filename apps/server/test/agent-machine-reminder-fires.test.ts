import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    attachComputer,
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import { closeFlush, nextAfter, seedScriptFire } from './agent-machine.fixture.ts';

const laptopId = `cmp_${'r'.repeat(16)}`;
const studioId = `cmp_${'u'.repeat(16)}`;
let setup: InvocationHarness;
let mini: FrameClient;
let laptop: FrameClient;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'machine-scripts' });
    await attachComputer(setup, { id: studioId, name: 'Studio' });
    await seedScriptFire(setup, { key: 'deploy' });
    mini = await connectComputer(setup.harness, setup.computerCredential);
    laptop = await connectComputer(
        setup.harness,
        await attachComputer(setup, { id: laptopId, name: 'MacBook' })
    );
});

afterAll(async () => {
    mini?.close();
    laptop?.close();
    await setup?.close();
});

test('a script still running on the old Machine is waited for, settled there once, and never replayed', async () => {
    const { agentId, owner, serverId } = setup;
    const script = await mini.next((frame) => frame.type === 'reminder-script');
    expect(script).toMatchObject({ attentionId: 'att_deploy' });
    expect(await dispatched('att_deploy')).toEqual([{ computer: setup.computerId, generation: 0 }]);

    const requested = await owner.trpc.agent.setMachine.mutate({
        agentId,
        computerId: laptopId,
        fromLastSynced: false,
        serverId,
    });
    expect(requested.change).toMatchObject({ computerId: laptopId, waitingFor: 'script' });
    expect(mini.frames.some((frame) => frame.type === 'drive-flush')).toBe(false);

    const result = {
        agentId,
        attentionId: 'att_deploy',
        durationMs: 5,
        exitCode: 0,
        fireId: 'fire_deploy',
        output: 'deployed',
        timedOut: false,
        type: 'reminder-script-result',
    };
    laptop.send(result);
    const flushed = nextAfter(mini, (frame) => frame.type === 'drive-flush');
    mini.send(result);
    const flush = await flushed;
    expect(await dispatched('att_deploy')).toEqual([]);
    expect(await fireOutcome('fire_deploy')).not.toBeNull();

    expect(await closeFlush(setup, setup.computerCredential, flush.flushId as string)).toBe(200);
    expect((await owner.trpc.agent.machine.query({ agentId, serverId })).computerId).toBe(laptopId);
    expect(laptop.frames.filter((frame) => frame.type === 'reminder-script')).toEqual([]);
});

test('an old Machine that is offline has its sent script fenced, and an unsent one replays on the new Machine', async () => {
    const { agentId, owner, serverId } = setup;
    await setup.harness.sql`update agents set computer_id = ${studioId} where id = ${agentId}`;
    await seedScriptFire(setup, { dispatchedTo: studioId, key: 'sent' });
    await seedScriptFire(setup, { key: 'unsent' });
    const replayed = nextAfter(
        mini,
        (frame) => frame.type === 'reminder-script' && frame.attentionId === 'att_unsent'
    );

    const moved = await owner.trpc.agent.setMachine.mutate({
        agentId,
        computerId: setup.computerId,
        fromLastSynced: true,
        serverId,
    });

    expect(moved).toEqual({ agentId, change: null, computerId: setup.computerId });
    await replayed;
    expect(mini.frames.some((frame) => frame.attentionId === 'att_sent')).toBe(false);
    expect(await dispatched('att_sent')).toEqual([]);
    expect(await fireOutcome('fire_sent')).toBe('failed');
    expect(await dispatched('att_unsent')).toEqual([{ computer: setup.computerId, generation: 2 }]);
});

async function dispatched(attentionId: string) {
    return await setup.harness.sql`
        select dispatched_computer_id as computer, dispatched_placement_generation as generation
        from reminder_agent_attention where id = ${attentionId}
    `;
}

async function fireOutcome(fireId: string) {
    const [fire] = (await setup.harness.sql`
        select outcome from reminder_fires where id = ${fireId}
    `) as { outcome: string | null }[];
    return fire?.outcome ?? null;
}

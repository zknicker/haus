import { expect, test } from 'bun:test';
import type { Worker } from '@haus/api';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test('a follow-up an auto-interrupt still could not deliver notifies once per window without settling', async () => {
    const runner = await fixture.mintRunner('run_cloud_stalled');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-stalled' }));
    const work = created.body.worker as Worker;
    const turnId = created.turnId as string;
    const socket = await fixture.attachComputer();
    const readStallAttentions = () =>
        fixture.harness.sql`
            select id from agent_inbox
            where source = 'worker_stall' and dedupe_key like ${`${turnId}:stall:%`}
        ` as Promise<{ id: string }[]>;
    const stallSummary =
        "Haus automatically interrupted the session to deliver this follow-up, but it still didn't go through. Last error: busy.";
    const stalled = (observedAt: string) => ({
        activity: {
            at: observedAt,
            summary: 'Auto-interrupt did not clear the session; still retrying.',
        },
        stallCode: 'followup-auto-interrupt-failed',
        observedAt,
        turnId,
        status: 'queued',
        summary: stallSummary,
        workerId: work.id,
    });

    socket.send(
        JSON.stringify({
            observation: stalled('2026-09-04T13:00:00.000Z'),
            type: 'worker-observation',
        })
    );
    await fixture.waitFor(async () => (await readStallAttentions()).length > 0 || null);
    expect(await readStallAttentions()).toHaveLength(1);
    expect(await fixture.readRun(turnId)).toMatchObject({
        status: 'queued',
        summary: stallSummary,
        terminal_at: null,
    });

    // A retry tick minutes later, same reminder window: no second attention.
    socket.send(
        JSON.stringify({
            observation: stalled('2026-09-04T13:05:00.000Z'),
            type: 'worker-observation',
        })
    );
    await Bun.sleep(100);
    expect(await readStallAttentions()).toHaveLength(1);

    // Three hours on, a new reminder window: a second, distinct attention.
    socket.send(
        JSON.stringify({
            observation: stalled('2026-09-04T16:05:00.000Z'),
            type: 'worker-observation',
        })
    );
    await fixture.waitFor(async () => ((await readStallAttentions()).length > 1 ? true : null));
    expect(await readStallAttentions()).toHaveLength(2);

    // The provider finally accepts it: the stall clears and the Run keeps going.
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T16:10:00.000Z',
                providerAgentId: 'bc_stalled',
                turnId,
                status: 'running',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'running');
    expect(await fixture.readRun(turnId)).toMatchObject({ status: 'running', summary: null });
    expect(await readStallAttentions()).toHaveLength(2);
    socket.close();
});

test('a Run already running never regresses to queued when its prompt briefly goes missing', async () => {
    const runner = await fixture.mintRunner('run_cloud_prompt_missing');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-prompt-missing' })
    );
    const work = created.body.worker as Worker;
    const turnId = created.turnId as string;
    const socket = await fixture.attachComputer();
    const readNotFoundAttentions = () =>
        fixture.harness.sql`
            select id from agent_inbox
            where source = 'worker_stall' and dedupe_key like ${`${turnId}:stall:%`}
        ` as Promise<{ id: string }[]>;

    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T13:00:00.000Z',
                providerAgentId: 'bc_prompt_missing',
                providerRunId: 'prompt-1',
                turnId,
                status: 'running',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'running');

    // A session log too large to scan back through reads as `queued` on the
    // provider side, but the Run already confirmed Claude took its prompt:
    // that progress must not be erased (TECH-7).
    socket.send(
        JSON.stringify({
            observation: {
                stallCode: 'claude-prompt-not-found',
                observedAt: '2026-09-04T13:05:00.000Z',
                turnId,
                status: 'queued',
                summary: 'Claude’s session log is too large to find this Run’s own prompt in it.',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitFor(async () => (await readNotFoundAttentions()).length > 0 || null);
    expect(await fixture.readRun(turnId)).toMatchObject({ status: 'running', terminal_at: null });
    const [runRow] = (await fixture.harness.sql`
        select stall_code from worker_turns where id = ${turnId}
    `) as { stall_code: string | null }[];
    expect(runRow?.stall_code).toBe('claude-prompt-not-found');
    expect(await fixture.readWork(work.id)).toMatchObject({ status: 'running' });
    expect(await readNotFoundAttentions()).toHaveLength(1);
    socket.close();
});

test('a job already cancelled raises no stall attention', async () => {
    const runner = await fixture.mintRunner('run_cloud_stall_cancelled');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'stall-cancelled' })
    );
    const work = created.body.worker as Worker;
    const turnId = created.turnId as string;
    const socket = await fixture.attachComputer();
    await fixture.harness.sql`
        update workers set status = 'cancelled', terminal_at = now() where id = ${work.id}
    `;

    socket.send(
        JSON.stringify({
            observation: {
                stallCode: 'claude-prompt-not-found',
                observedAt: '2026-09-04T13:00:00.000Z',
                turnId,
                status: 'running',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitFor(async () => {
        const [run] = (await fixture.harness.sql`
            select stall_code from worker_turns where id = ${turnId}
        `) as { stall_code: string | null }[];
        return run?.stall_code;
    });

    const rows = (await fixture.harness.sql`
        select id from agent_inbox where dedupe_key like ${`${turnId}:stall:%`}
    `) as { id: string }[];
    expect(rows).toHaveLength(0);
    socket.close();
});

test('a provider cancel clears the unread stall notices and queues no report', async () => {
    const runner = await fixture.mintRunner('run_cloud_stall_settles');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-stall-settles' })
    );
    const work = created.body.worker as Worker;
    const turnId = created.turnId as string;
    const socket = await fixture.attachComputer();
    const readNotices = () =>
        fixture.harness.sql`
            select source from agent_inbox where worker_turn_id = ${turnId}
        ` as Promise<{ source: string }[]>;

    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T13:00:00.000Z',
                turnId,
                stallCode: 'followup-auto-interrupt-failed',
                status: 'queued',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitFor(async () => (await readNotices()).length > 0 || null);
    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T13:05:00.000Z',
                turnId,
                status: 'cancelled',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'cancelled');

    expect(await readNotices()).toEqual([]);
    socket.close();
});

test('a Run being cancelled earns no stall notice', async () => {
    const runner = await fixture.mintRunner('run_cloud_stall_cancelling');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-stall-cancelling' })
    );
    const work = created.body.worker as Worker;
    const turnId = created.turnId as string;
    const socket = await fixture.attachComputer();
    expect((await fixture.postCancel(runner, work.id)).status).toBe(200);

    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T13:00:00.000Z',
                turnId,
                stallCode: 'followup-auto-interrupt-failed',
                status: 'queued',
                workerId: work.id,
            },
            type: 'worker-observation',
        })
    );
    await fixture.waitFor(async () => {
        const [run] = (await fixture.harness.sql`
            select stall_code from worker_turns where id = ${turnId}
        `) as { stall_code: string | null }[];
        return run?.stall_code;
    });

    expect(
        await fixture.harness.sql`select id from agent_inbox where worker_turn_id = ${turnId}`
    ).toHaveLength(0);
    socket.close();
});

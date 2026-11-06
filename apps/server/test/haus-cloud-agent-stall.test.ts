import { expect, test } from 'bun:test';
import type { CloudAgentWork } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('a follow-up an auto-interrupt still could not deliver notifies once per window without settling', async () => {
    const runner = await fixture.mintRunner('run_cloud_stalled');
    const created = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-stalled' }));
    const work = created.body.work as CloudAgentWork;
    const runId = created.body.runId as string;
    const socket = await fixture.attachComputer();
    const readStallAttentions = () =>
        fixture.harness.sql`
            select id from agent_inbox
            where source = 'cloud_agent_work' and dedupe_key like ${`${runId}:stall:%`}
        ` as Promise<{ id: string }[]>;
    const stallSummary =
        "Haus automatically interrupted the session to deliver this follow-up, but it still didn't go through. Last error: busy.";
    const stalled = (observedAt: string) => ({
        activity: {
            at: observedAt,
            summary: 'Auto-interrupt did not clear the session; still retrying.',
        },
        errorCode: 'followup-auto-interrupt-failed',
        observedAt,
        runId,
        status: 'queued',
        summary: stallSummary,
        workId: work.id,
    });

    socket.send(
        JSON.stringify({
            observation: stalled('2026-09-04T13:00:00.000Z'),
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitFor(async () => (await readStallAttentions()).length > 0 || null);
    expect(await readStallAttentions()).toHaveLength(1);
    expect(await fixture.readRun(runId)).toMatchObject({
        status: 'queued',
        summary: stallSummary,
        terminal_at: null,
    });

    // A retry tick minutes later, same reminder window: no second attention.
    socket.send(
        JSON.stringify({
            observation: stalled('2026-09-04T13:05:00.000Z'),
            type: 'cloud-agent-observation',
        })
    );
    await Bun.sleep(100);
    expect(await readStallAttentions()).toHaveLength(1);

    // Three hours on, a new reminder window: a second, distinct attention.
    socket.send(
        JSON.stringify({
            observation: stalled('2026-09-04T16:05:00.000Z'),
            type: 'cloud-agent-observation',
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
                runId,
                status: 'running',
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'running');
    expect(await fixture.readRun(runId)).toMatchObject({ status: 'running', summary: null });
    expect(await readStallAttentions()).toHaveLength(2);
    socket.close();
});

test('a Run already running never regresses to queued when its prompt briefly goes missing', async () => {
    const runner = await fixture.mintRunner('run_cloud_prompt_missing');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-prompt-missing' })
    );
    const work = created.body.work as CloudAgentWork;
    const runId = created.body.runId as string;
    const socket = await fixture.attachComputer();
    const readNotFoundAttentions = () =>
        fixture.harness.sql`
            select id from agent_inbox
            where source = 'cloud_agent_work' and dedupe_key like ${`${runId}:stall:%`}
        ` as Promise<{ id: string }[]>;

    socket.send(
        JSON.stringify({
            observation: {
                observedAt: '2026-09-04T13:00:00.000Z',
                providerAgentId: 'bc_prompt_missing',
                providerRunId: 'prompt-1',
                runId,
                status: 'running',
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitForWorkStatus(work.id, 'running');

    // A session log too large to scan back through reads as `queued` on the
    // provider side, but the Run already confirmed Claude took its prompt:
    // that progress must not be erased (TECH-7).
    socket.send(
        JSON.stringify({
            observation: {
                errorCode: 'claude-prompt-not-found',
                observedAt: '2026-09-04T13:05:00.000Z',
                runId,
                status: 'queued',
                summary: 'Claude’s session log is too large to find this Run’s own prompt in it.',
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitFor(async () => (await readNotFoundAttentions()).length > 0 || null);
    expect(await fixture.readRun(runId)).toMatchObject({ status: 'running', terminal_at: null });
    const [runRow] = (await fixture.harness.sql`
        select error_code from cloud_agent_runs where id = ${runId}
    `) as { error_code: string | null }[];
    expect(runRow?.error_code).toBe('claude-prompt-not-found');
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
    const work = created.body.work as CloudAgentWork;
    const runId = created.body.runId as string;
    const socket = await fixture.attachComputer();
    await fixture.harness.sql`
        update cloud_agent_work set status = 'cancelled', terminal_at = now() where id = ${work.id}
    `;

    socket.send(
        JSON.stringify({
            observation: {
                errorCode: 'claude-prompt-not-found',
                observedAt: '2026-09-04T13:00:00.000Z',
                runId,
                status: 'running',
                workId: work.id,
            },
            type: 'cloud-agent-observation',
        })
    );
    await fixture.waitFor(async () => {
        const [run] = (await fixture.harness.sql`
            select error_code from cloud_agent_runs where id = ${runId}
        `) as { error_code: string | null }[];
        return run?.error_code;
    });

    const rows = (await fixture.harness.sql`
        select id from agent_inbox where dedupe_key like ${`${runId}:stall:%`}
    `) as { id: string }[];
    expect(rows).toHaveLength(0);
    socket.close();
});

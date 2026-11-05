import { expect, test } from 'bun:test';
import type { CloudAgentWork } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('a follow-up stalled past the delivery window notifies once per window without settling', async () => {
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
        'The provider has stayed busy for over 30 minutes. Last error: busy. Haus keeps retrying.';
    const stalled = (observedAt: string) => ({
        activity: { at: observedAt, summary: 'Session busy for over 30 minutes; still retrying.' },
        errorCode: 'followup-delivery-timeout',
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

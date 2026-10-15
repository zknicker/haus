import { expect, test } from 'bun:test';
import { agentCloudAgentSendReceiptSchema, type CloudAgentWork } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

const opus = {
    description: null,
    displayName: 'Claude Opus',
    effort: null,
    family: 'claude' as const,
    fast: null,
    id: 'opus',
    order: 0,
};

test('each provider keeps its own model, and a Claude Run sends Claude’s', async () => {
    const inventory = {
        cloudAgentProviders: [
            { models: null, provider: 'cursor', ready: true, reason: null },
            {
                models: {
                    autoAvailable: false,
                    models: [opus],
                    refreshedAt: '2026-10-14T12:00:00.000Z',
                },
                provider: 'claude',
                ready: true,
                reason: null,
            },
        ],
        runtimes: [],
    };
    await fixture.harness.sql`
        update computers set reported_inventory = ${inventory}::jsonb
        where id = ${fixture.computerId}
    `;
    const settings = fixture.owner.trpc.cloudAgentSettings;
    const model = { id: 'opus', kind: 'model' as const, params: {} };
    expect(
        await settings.setModel.mutate({ model, provider: 'claude', serverId: fixture.serverId })
    ).toMatchObject({ model, provider: 'claude', savedModelUnavailable: false });
    expect(await settings.get.query({ serverId: fixture.serverId })).toMatchObject({
        catalog: null,
        model: { kind: 'auto' },
        provider: 'cursor',
    });

    const runner = await fixture.mintRunner('run_claude_model');
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'claude-model', provider: 'claude' })
    );
    expect(started.status).toBe(200);
    expect(started.body.work?.provider).toBe('claude');
    expect(started.body.work?.runs[0]?.model).toEqual({
        droppedParams: [],
        fallbackFrom: null,
        id: 'opus',
        params: [],
    });
});

test('a question settles the Run as pending input, wakes the Agent once, and an answer reopens it', async () => {
    const runner = await fixture.mintRunner('run_claude_question');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'claude-question', provider: 'claude' })
    );
    const work = created.body.work as CloudAgentWork;
    const runId = created.body.runId as string;
    const socket = await fixture.attachComputer();
    const question = {
        observation: {
            observedAt: '2026-10-14T12:01:00.000Z',
            providerAgentId: 'session_01Question',
            providerRunId: 'prompt-uuid-1',
            providerUrl: 'https://claude.ai/code/session_01Question',
            rawStatus: 'requires_action',
            runId,
            status: 'pending_input',
            summary: 'Should the reminder default to 9am or 10am?',
            workId: work.id,
        },
        type: 'cloud-agent-observation',
    };
    socket.send(JSON.stringify(question));
    await fixture.waitForWorkStatus(work.id, 'pending_input');
    // The same reading again is a no-op: one question, one wake.
    socket.send(JSON.stringify(question));
    await Bun.sleep(150);
    expect(await fixture.readAttentions(runId)).toHaveLength(1);

    const active = await fixture.owner.trpc.cloudAgentWork.listActive.query({
        serverId: fixture.serverId,
    });
    const listed = active.find((entry) => entry.work.id === work.id)?.work;
    expect(listed?.job).toMatchObject({
        question: 'Should the reminder default to 9am or 10am?',
        state: 'pending-input',
    });

    const answer = await fetch(new URL('/api/agent/cloud-agents/send', fixture.harness.url), {
        body: JSON.stringify({ nonce: 'claude-answer', workId: work.id }),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(answer.status).toBe(200);
    const sent = agentCloudAgentSendReceiptSchema.parse(await answer.json());
    expect(sent.work.status).toBe('queued');
    // Until Claude picks the answer up, the question still stands on the card.
    expect(sent.work.job).toMatchObject({
        followUp: { state: 'waiting' },
        state: 'pending-input',
    });
});

import { expect, test } from 'bun:test';
import {
    agentCloudAgentReceiptSchema,
    agentCloudAgentSendReceiptSchema,
    type CloudAgentModelCatalog,
} from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

const nano = { description: null, displayName: 'GPT-5.4 Nano', id: 'gpt-5.4-nano' };
const opus = { description: 'Frontier', displayName: 'Claude Opus', id: 'claude-opus' };

async function reportCatalog(catalog: CloudAgentModelCatalog | null) {
    const inventory = {
        cloudAgentProviders: [{ models: catalog, provider: 'cursor', ready: true, reason: null }],
        runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
    };
    await fixture.harness.sql`
        update computers set reported_inventory = ${inventory}::jsonb
        where id = ${fixture.computerId}
    `;
}

async function startWork(nonce: string) {
    const runner = await fixture.mintRunner(`run_${nonce}`);
    const response = await fixture.postStart(runner, fixture.startBody({ nonce }));
    expect(response.status).toBe(200);
    return { receipt: agentCloudAgentReceiptSchema.parse(response.body), runner };
}

test('a Server starts on Auto with no catalog until a Computer reports one', async () => {
    const settings = fixture.owner.trpc.cloudAgentSettings;
    expect(await settings.get.query({ serverId: fixture.serverId })).toEqual({
        catalog: null,
        model: { kind: 'auto' },
        savedModelUnavailable: false,
    });

    await reportCatalog({ models: [nano, opus], refreshedAt: '2026-10-02T12:00:00.000Z' });
    expect(
        await fixture.peer.trpc.cloudAgentSettings.get.query({ serverId: fixture.serverId })
    ).toMatchObject({ catalog: { models: [nano, opus] }, model: { kind: 'auto' } });
    const stranger = await fixture.signIn('user_cloud_model_stranger', ['dee@haus.test']);
    try {
        await expect(
            stranger.trpc.cloudAgentSettings.get.query({ serverId: fixture.serverId })
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    } finally {
        stranger.close();
    }
});

test('only an Owner or Admin saves a model, and only one the catalog lists', async () => {
    await reportCatalog({ models: [nano, opus], refreshedAt: '2026-10-02T12:00:00.000Z' });
    const model = { id: nano.id, kind: 'model' as const };
    await expect(
        fixture.peer.trpc.cloudAgentSettings.setModel.mutate({ model, serverId: fixture.serverId })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    await expect(
        fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
            model: { id: 'not-a-cursor-model', kind: 'model' },
            serverId: fixture.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });

    expect(
        await fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
            model,
            serverId: fixture.serverId,
        })
    ).toMatchObject({ model, savedModelUnavailable: false });
});

test('every Run records the model it asked for, falling back to Auto when the catalog drops it', async () => {
    await reportCatalog({ models: [nano, opus], refreshedAt: '2026-10-02T12:00:00.000Z' });
    await fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
        model: { id: nano.id, kind: 'model' },
        serverId: fixture.serverId,
    });
    const chosen = await startWork('model-chosen');
    expect(chosen.receipt.work.runs[0]?.model).toEqual({ fallbackFrom: null, id: nano.id });

    await reportCatalog({ models: [opus], refreshedAt: '2026-10-03T12:00:00.000Z' });
    expect(
        await fixture.owner.trpc.cloudAgentSettings.get.query({ serverId: fixture.serverId })
    ).toMatchObject({ model: { id: nano.id, kind: 'model' }, savedModelUnavailable: true });

    await fixture.harness.sql`
        update cloud_agent_work set provider_agent_id = 'cursor_model_agent'
        where id = ${chosen.receipt.work.id}
    `;
    const followUp = await fetch(new URL('/api/agent/cloud-agents/send', fixture.harness.url), {
        body: JSON.stringify({ nonce: 'model-followup', workId: chosen.receipt.work.id }),
        headers: {
            authorization: `Bearer ${chosen.runner.token}`,
            'content-type': 'application/json',
        },
        method: 'POST',
    });
    const sent = agentCloudAgentSendReceiptSchema.parse(await followUp.json());
    expect(sent.work.runs.find((run) => run.runId === sent.runId)?.model).toEqual({
        fallbackFrom: nano.id,
        id: null,
    });
    expect(sent.work.runs.find((run) => run.runId === chosen.receipt.runId)?.model).toEqual({
        fallbackFrom: null,
        id: nano.id,
    });

    await reportCatalog(null);
    const missing = await startWork('model-no-catalog');
    expect(missing.receipt.work.runs[0]?.model).toEqual({ fallbackFrom: nano.id, id: null });

    await fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
        model: { kind: 'auto' },
        serverId: fixture.serverId,
    });
    const auto = await startWork('model-auto');
    expect(auto.receipt.work.runs[0]?.model).toEqual({ fallbackFrom: null, id: null });
});

test('a Computer report carries the Cursor catalog to Server settings', async () => {
    const socket = await fixture.attachComputer();
    try {
        const catalog = { models: [opus], refreshedAt: '2026-10-04T12:00:00.000Z' };
        socket.send(
            JSON.stringify({
                agents: [],
                inventory: {
                    cloudAgentProviders: [
                        { models: catalog, provider: 'cursor', ready: true, reason: null },
                    ],
                    runtimes: [
                        {
                            id: 'codex',
                            label: 'Codex',
                            models: [{ id: 'gpt-5.6-sol', label: 'Sol' }],
                        },
                    ],
                },
                type: 'report',
            })
        );
        const settings = await fixture.waitFor(async () => {
            const read = await fixture.owner.trpc.cloudAgentSettings.get.query({
                serverId: fixture.serverId,
            });
            return read.catalog?.refreshedAt === catalog.refreshedAt ? read : null;
        });
        expect(settings.catalog).toEqual(catalog);
    } finally {
        socket.close();
    }
});

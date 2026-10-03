import { expect, test } from 'bun:test';
import {
    agentCloudAgentReceiptSchema,
    agentCloudAgentSendReceiptSchema,
    type CloudAgentModelCatalog,
} from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

const nano = {
    description: null,
    displayName: 'GPT-5.4 Nano',
    effort: {
        defaultValue: 'medium',
        options: [
            { displayName: 'Low', value: 'low' },
            { displayName: 'Medium', value: 'medium' },
            { displayName: 'High', value: 'high' },
        ],
        providerParamId: 'reasoning',
    },
    family: 'gpt' as const,
    fast: { defaultValue: true },
    id: 'gpt-5.4-nano',
    order: 0,
};
const opus = {
    description: 'Frontier',
    displayName: 'Claude Opus',
    effort: null,
    family: 'claude' as const,
    fast: null,
    id: 'claude-opus',
    order: 1,
};
const noModel = { droppedParams: [], fallbackFrom: null, id: null, params: [] };

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

test('only an Owner or Admin saves a model, and only one the catalog lists with offered params', async () => {
    await reportCatalog({ models: [nano, opus], refreshedAt: '2026-10-02T12:00:00.000Z' });
    const model = { id: nano.id, kind: 'model' as const, params: { effort: 'low', fast: false } };
    await expect(
        fixture.peer.trpc.cloudAgentSettings.setModel.mutate({ model, serverId: fixture.serverId })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    await expect(
        fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
            model: { id: 'not-a-cursor-model', kind: 'model', params: {} },
            serverId: fixture.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    for (const params of [{ effort: 'max' }, { effort: 'low', fast: true }]) {
        await expect(
            fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
                model: { id: params.fast ? opus.id : nano.id, kind: 'model', params },
                serverId: fixture.serverId,
            })
        ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    }

    expect(
        await fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
            model,
            serverId: fixture.serverId,
        })
    ).toMatchObject({ model, savedModelUnavailable: false });
    // A model saved without params keeps the model defaults; Cursor default clears them.
    expect(
        await fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
            model: { id: opus.id, kind: 'model', params: {} },
            serverId: fixture.serverId,
        })
    ).toMatchObject({ model: { id: opus.id, kind: 'model', params: {} } });
    await fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
        model: { kind: 'auto' },
        serverId: fixture.serverId,
    });
    const [server] = await fixture.harness.sql`
        select cloud_agent_model_id, cloud_agent_model_params from servers where id = ${fixture.serverId}
    `;
    expect(server).toEqual({ cloud_agent_model_id: null, cloud_agent_model_params: {} });
});

test('every Run records the model and params it asked for, falling back when the catalog drops them', async () => {
    await reportCatalog({ models: [nano, opus], refreshedAt: '2026-10-02T12:00:00.000Z' });
    await fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
        model: { id: nano.id, kind: 'model', params: { effort: 'high', fast: false } },
        serverId: fixture.serverId,
    });
    const nanoHigh = {
        droppedParams: [],
        fallbackFrom: null,
        id: nano.id,
        params: [
            { name: 'effort', providerParamId: 'reasoning', value: 'high' },
            { name: 'fast', providerParamId: 'fast', value: 'false' },
        ],
    };
    const chosen = await startWork('model-chosen');
    expect(chosen.receipt.work.runs[0]?.model).toEqual(nanoHigh);

    // Cursor withdraws High effort and fast mode: the Run keeps the model with its defaults.
    const narrowed = {
        ...nano,
        effort: { ...nano.effort, options: nano.effort.options.slice(0, 2) },
        fast: null,
    };
    await reportCatalog({ models: [narrowed, opus], refreshedAt: '2026-10-02T13:00:00.000Z' });
    const dropped = await startWork('model-dropped-params');
    expect(dropped.receipt.work.runs[0]?.model).toEqual({
        droppedParams: ['effort', 'fast'],
        fallbackFrom: null,
        id: nano.id,
        params: [],
    });

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
        ...noModel,
        fallbackFrom: nano.id,
    });
    expect(sent.work.runs.find((run) => run.runId === chosen.receipt.runId)?.model).toEqual(
        nanoHigh
    );

    await reportCatalog(null);
    const missing = await startWork('model-no-catalog');
    expect(missing.receipt.work.runs[0]?.model).toEqual({ ...noModel, fallbackFrom: nano.id });

    await fixture.owner.trpc.cloudAgentSettings.setModel.mutate({
        model: { kind: 'auto' },
        serverId: fixture.serverId,
    });
    const auto = await startWork('model-auto');
    expect(auto.receipt.work.runs[0]?.model).toEqual(noModel);
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

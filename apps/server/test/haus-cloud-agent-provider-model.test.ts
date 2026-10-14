import { expect, test } from 'bun:test';
import { agentCloudAgentReceiptSchema } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';
import { nano, opus } from './cloud-agent-model-fixture.ts';

const fixture = cloudAgentFixture();

test('Cursor and Claude save and resolve models from their own catalogs', async () => {
    const catalog = {
        autoAvailable: true,
        models: [nano],
        refreshedAt: '2026-10-13T12:00:00.000Z',
    };
    const claudeCatalog = { ...catalog, autoAvailable: false, models: [opus] };
    await fixture.harness.sql`update computers set reported_inventory = ${{
        cloudAgentProviders: [
            { provider: 'cursor', models: catalog, ready: true, reason: null },
            { provider: 'claude', models: claudeCatalog, ready: true, reason: null },
        ],
        runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
    }}::jsonb where id = ${fixture.computerId}`;
    const settings = fixture.owner.trpc.cloudAgentSettings;
    await settings.setModel.mutate({
        serverId: fixture.serverId,
        provider: 'cursor',
        model: { kind: 'model', id: nano.id, params: {} },
    });
    await settings.setModel.mutate({
        serverId: fixture.serverId,
        provider: 'claude',
        model: { kind: 'model', id: opus.id, params: {} },
    });
    await expect(
        settings.setModel.mutate({
            serverId: fixture.serverId,
            provider: 'claude',
            model: { kind: 'model', id: nano.id, params: {} },
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    expect(
        await settings.get.query({ serverId: fixture.serverId, provider: 'cursor' })
    ).toMatchObject({ model: { kind: 'model', id: nano.id }, catalog: { models: [nano] } });
    expect(
        await settings.get.query({ serverId: fixture.serverId, provider: 'claude' })
    ).toMatchObject({
        model: { kind: 'model', id: opus.id },
        catalog: { models: [opus], autoAvailable: false },
    });
    const runner = await fixture.mintRunner('run_model_claude');
    const launch = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'claude-model-isolated', provider: 'claude' })
    );
    expect(launch.status).toBe(200);
    const receipt = agentCloudAgentReceiptSchema.parse(launch.body);
    expect(receipt.work.provider).toBe('claude');
    expect(receipt.work.runs[0]?.model.id).toBe(opus.id);
    await settings.setModel.mutate({
        serverId: fixture.serverId,
        provider: 'claude',
        model: { kind: 'auto' },
    });
    const autoLaunch = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'claude-native-default', provider: 'claude' })
    );
    expect(agentCloudAgentReceiptSchema.parse(autoLaunch.body).work.runs[0]?.model.id).toBeNull();
    expect(
        (await settings.get.query({ serverId: fixture.serverId, provider: 'cursor' })).model
    ).toMatchObject({ kind: 'model', id: nano.id });
});

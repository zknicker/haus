import { expect, test } from 'bun:test';
import {
    cloudAgentModelSettingSchema,
    cloudAgentRunModelSchema,
    resolveCloudAgentRunModel,
} from './cloud-agent-model.ts';
import { computerInventorySchema } from './computer-inventory.ts';

const catalog = {
    models: [
        { description: null, displayName: 'GPT-5.4 Nano', id: 'gpt-5.4-nano' },
        { description: 'Frontier', displayName: 'Claude Opus', id: 'claude-opus' },
    ],
    refreshedAt: '2026-10-02T12:00:00.000Z',
};

test('Auto sends no model and never records a fallback', () => {
    expect(resolveCloudAgentRunModel({ kind: 'auto' }, catalog)).toEqual({
        fallbackFrom: null,
        id: null,
    });
    expect(resolveCloudAgentRunModel({ kind: 'auto' }, null)).toEqual({
        fallbackFrom: null,
        id: null,
    });
});

test('a listed saved model is sent as chosen', () => {
    expect(resolveCloudAgentRunModel({ id: 'gpt-5.4-nano', kind: 'model' }, catalog)).toEqual({
        fallbackFrom: null,
        id: 'gpt-5.4-nano',
    });
});

test('an unlisted saved model or a missing catalog falls back to Auto and says so', () => {
    expect(resolveCloudAgentRunModel({ id: 'retired-model', kind: 'model' }, catalog)).toEqual({
        fallbackFrom: 'retired-model',
        id: null,
    });
    expect(resolveCloudAgentRunModel({ id: 'gpt-5.4-nano', kind: 'model' }, null)).toEqual({
        fallbackFrom: 'gpt-5.4-nano',
        id: null,
    });
});

test('the setting is a narrow union and a Run cannot both send and fall back', () => {
    expect(cloudAgentModelSettingSchema.safeParse({ kind: 'model' }).success).toBe(false);
    expect(cloudAgentModelSettingSchema.safeParse({ id: 'x', kind: 'auto' }).success).toBe(false);
    expect(cloudAgentModelSettingSchema.safeParse({ id: ' ', kind: 'model' }).success).toBe(false);
    expect(cloudAgentRunModelSchema.safeParse({ fallbackFrom: 'a', id: 'b' }).success).toBe(false);
});

test('an inventory stored before catalogs reads as no catalog', () => {
    const inventory = computerInventorySchema.parse({
        cloudAgentProviders: [{ provider: 'cursor', ready: true, reason: null }],
        runtimes: [],
    });
    expect(inventory.cloudAgentProviders?.[0]?.models).toBeNull();
    expect(
        computerInventorySchema.parse({
            cloudAgentProviders: [
                { models: catalog, provider: 'cursor', ready: true, reason: null },
            ],
            runtimes: [],
        }).cloudAgentProviders?.[0]?.models?.models
    ).toHaveLength(2);
});

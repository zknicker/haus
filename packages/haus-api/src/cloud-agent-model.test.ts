import { expect, test } from 'bun:test';
import {
    cloudAgentModelCatalogSchema,
    cloudAgentModelSettingSchema,
    cloudAgentRunModelSchema,
} from './cloud-agent-model.ts';
import { resolveCloudAgentRunModel } from './cloud-agent-model-choice.ts';
import { computerInventorySchema } from './computer-inventory.ts';

const nano = {
    description: null,
    displayName: 'GPT-5.4 Nano',
    effort: {
        defaultValue: 'medium',
        options: [
            { displayName: 'Low', value: 'low' },
            { displayName: 'Medium', value: 'medium' },
        ],
        providerParamId: 'reasoning',
    },
    family: 'gpt' as const,
    fast: null,
    id: 'gpt-5.4-nano',
    order: 0,
};
const composer = {
    description: null,
    displayName: 'Composer 2.5',
    effort: null,
    family: 'composer' as const,
    fast: { defaultValue: true },
    id: 'composer-2.5',
    order: 1,
};
const catalog = {
    autoAvailable: true,
    models: [nano, composer],
    refreshedAt: '2026-10-02T12:00:00.000Z',
};
const noAutoCatalog = { ...catalog, autoAvailable: false };
const none = { droppedParams: [], fallbackFrom: null, id: null, params: [] };
const auto = { ...none, id: 'default' };

test("Auto sends Cursor's default id whenever the catalog offers it, and never falls back", () => {
    expect(resolveCloudAgentRunModel({ kind: 'auto' }, catalog)).toEqual(auto);
});

test('Auto sends no model when the catalog lacks Auto or there is no catalog', () => {
    expect(resolveCloudAgentRunModel({ kind: 'auto' }, noAutoCatalog)).toEqual(none);
    expect(resolveCloudAgentRunModel({ kind: 'auto' }, null)).toEqual(none);
});

test('a listed saved model is sent with its chosen parameters under the provider id', () => {
    expect(
        resolveCloudAgentRunModel(
            { id: 'gpt-5.4-nano', kind: 'model', params: { effort: 'low' } },
            catalog
        )
    ).toEqual({
        droppedParams: [],
        fallbackFrom: null,
        id: 'gpt-5.4-nano',
        params: [{ name: 'effort', providerParamId: 'reasoning', value: 'low' }],
    });
    expect(
        resolveCloudAgentRunModel(
            { id: 'composer-2.5', kind: 'model', params: { fast: false } },
            catalog
        ).params
    ).toEqual([{ name: 'fast', providerParamId: 'fast', value: 'false' }]);
});

test('an unset parameter sends nothing, so the model default applies', () => {
    expect(
        resolveCloudAgentRunModel({ id: 'gpt-5.4-nano', kind: 'model', params: {} }, catalog)
    ).toEqual({ droppedParams: [], fallbackFrom: null, id: 'gpt-5.4-nano', params: [] });
});

test('a saved parameter the model no longer offers is dropped and recorded', () => {
    expect(
        resolveCloudAgentRunModel(
            { id: 'gpt-5.4-nano', kind: 'model', params: { effort: 'max', fast: true } },
            catalog
        )
    ).toEqual({
        droppedParams: ['effort', 'fast'],
        fallbackFrom: null,
        id: 'gpt-5.4-nano',
        params: [],
    });
});

test('an unlisted saved model or a missing catalog falls back to Auto and says so', () => {
    const retired = { id: 'retired-model', kind: 'model' as const, params: { effort: 'low' } };
    expect(resolveCloudAgentRunModel(retired, catalog)).toEqual({
        ...auto,
        fallbackFrom: 'retired-model',
    });
    expect(resolveCloudAgentRunModel(retired, noAutoCatalog)).toEqual({
        ...none,
        fallbackFrom: 'retired-model',
    });
    expect(
        resolveCloudAgentRunModel({ id: 'gpt-5.4-nano', kind: 'model', params: {} }, null)
    ).toEqual({ ...none, fallbackFrom: 'gpt-5.4-nano' });
});

test('the setting is a narrow union; an empty params object means the model defaults', () => {
    expect(cloudAgentModelSettingSchema.safeParse({ kind: 'model' }).success).toBe(false);
    expect(cloudAgentModelSettingSchema.safeParse({ id: 'x', kind: 'auto' }).success).toBe(false);
    expect(
        cloudAgentModelSettingSchema.safeParse({ id: ' ', kind: 'model', params: {} }).success
    ).toBe(false);
    expect(cloudAgentModelSettingSchema.safeParse({ id: 'x', kind: 'model' }).success).toBe(false);
    expect(
        cloudAgentModelSettingSchema.safeParse({ id: 'x', kind: 'model', params: {} }).success
    ).toBe(true);
    expect(
        cloudAgentModelSettingSchema.safeParse({
            id: 'x',
            kind: 'model',
            params: { context: '1m' },
        }).success
    ).toBe(false);
    expect(
        cloudAgentModelSettingSchema.safeParse({ id: 'x', kind: 'model', params: { fast: 'true' } })
            .success
    ).toBe(false);
});

test('a Run cannot both send a catalog model and fall back, nor carry parameters without one', () => {
    expect(
        cloudAgentRunModelSchema.safeParse({ ...none, fallbackFrom: 'a', id: 'b' }).success
    ).toBe(false);
    expect(cloudAgentRunModelSchema.safeParse({ ...auto, fallbackFrom: 'a' }).success).toBe(true);
    expect(
        cloudAgentRunModelSchema.safeParse({
            ...auto,
            params: [{ name: 'fast', providerParamId: 'fast', value: 'true' }],
        }).success
    ).toBe(false);
    expect(
        cloudAgentRunModelSchema.safeParse({
            ...none,
            params: [{ name: 'fast', providerParamId: 'fast', value: 'true' }],
        }).success
    ).toBe(false);
    expect(cloudAgentRunModelSchema.safeParse({ ...none, droppedParams: ['effort'] }).success).toBe(
        false
    );
});

test('a catalog effort default must be one of its options', () => {
    const wrong = { ...nano, effort: { ...nano.effort, defaultValue: 'xhigh' } };
    expect(cloudAgentModelCatalogSchema.safeParse({ ...catalog, models: [wrong] }).success).toBe(
        false
    );
    expect(cloudAgentModelCatalogSchema.safeParse(catalog).success).toBe(true);
    const { autoAvailable: _, ...withoutAutoFlag } = catalog;
    expect(cloudAgentModelCatalogSchema.safeParse(withoutAutoFlag).success).toBe(false);
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

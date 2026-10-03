import { expect, test } from 'bun:test';
import { cloudAgentModelCatalogSchema } from '@haus/api';
import cursorModels from './cursor/cursor-models.fixture.json' with { type: 'json' };
import {
    cleanCloudAgentModelLabel,
    cloudAgentModelFamilyOf,
    mapCloudAgentModelCatalog,
} from './model-catalog-mapping.ts';
import type { CloudAgentModelListing } from './provider.ts';

// Trimmed from a real `Cursor.models.list()`: each model keeps its parameters,
// its default variant, and its first variant.
const listings: CloudAgentModelListing[] = cursorModels;

function mapped(id: string) {
    return mapCloudAgentModelCatalog(listings).find((model) => model.id === id);
}

test('Cursor order is kept and Cursor’s own Auto entry is dropped', () => {
    const models = mapCloudAgentModelCatalog(listings);
    expect(models.map((model) => model.id)).toEqual(
        listings.map((listing) => listing.id).filter((id) => id !== 'default')
    );
    expect(models.map((model) => model.order)).toEqual(models.map((_, index) => index));
    expect(
        cloudAgentModelCatalogSchema.safeParse({ models, refreshedAt: new Date().toISOString() })
            .success
    ).toBe(true);
});

test('the three effort spellings become one effort control that remembers the wire id', () => {
    expect(mapped('claude-opus-5-5')?.effort).toEqual({
        defaultValue: 'medium',
        options: [
            { displayName: 'Low', value: 'low' },
            { displayName: 'Medium', value: 'medium' },
            { displayName: 'High', value: 'high' },
            { displayName: 'Extra High', value: 'xhigh' },
            { displayName: 'Max', value: 'max' },
        ],
        providerParamId: 'effort',
    });
    expect(mapped('gpt-5.3-codex')?.effort).toMatchObject({
        defaultValue: 'high',
        providerParamId: 'reasoning',
    });
    expect(mapped('grok-4.7')?.effort).toMatchObject({
        defaultValue: 'high',
        providerParamId: 'reasoning_effort',
    });
});

test('fast is an on/off choice with the default variant’s value; context and thinking are ignored', () => {
    expect(mapped('grok-4.7')?.fast).toEqual({ defaultValue: true });
    expect(mapped('composer-2.5')).toMatchObject({ effort: null, fast: { defaultValue: true } });
    expect(mapped('claude-opus-5-5')?.fast).toEqual({ defaultValue: false });
    // Opus 4.5 offers only thinking, so Haus offers no control for it.
    expect(mapped('claude-opus-4-5')).toMatchObject({ effort: null, fast: null });
    expect(mapped('gemini-3.1-pro')).toMatchObject({ effort: null, fast: null });
});

test('families come from the id and name; Codex is GPT', () => {
    expect(mapCloudAgentModelCatalog(listings).map((model) => [model.id, model.family])).toEqual([
        ['grok-4.7', 'grok'],
        ['composer-2.5', 'composer'],
        ['claude-opus-5-5', 'claude'],
        ['muse-spark-1.3', 'other'],
        ['gpt-5.3-codex', 'gpt'],
        ['claude-opus-4-5', 'claude'],
        ['gemini-3.1-pro', 'gemini'],
        ['kimi-k3', 'kimi'],
        ['glm-5p3', 'glm'],
    ]);
    expect(cloudAgentModelFamilyOf('x-1', 'Codex Max')).toBe('gpt');
});

test('labels lose zero-width characters and doubled spaces', () => {
    expect(cleanCloudAgentModelLabel('Grok 4.7  High Fast​​')).toBe('Grok 4.7 High Fast');
    const [model] = mapCloudAgentModelCatalog([
        {
            description: '  Fast​  model ',
            displayName: ' Grok​  4.7 ',
            id: 'grok-4.7',
            parameters: [
                {
                    id: 'effort',
                    values: [{ displayName: 'Extra​  High', value: 'xhigh' }, { value: 'low' }],
                },
            ],
        },
    ]);
    expect(model).toMatchObject({
        description: 'Fast model',
        displayName: 'Grok 4.7',
        effort: {
            defaultValue: null,
            options: [
                { displayName: 'Extra High', value: 'xhigh' },
                { displayName: 'low', value: 'low' },
            ],
        },
    });
});

test('duplicates keep the first listing, a malformed param costs only that control, and the list is capped', () => {
    const many = Array.from({ length: 205 }, (_, index) => ({
        displayName: `Model ${index}`,
        id: `model-${index}`,
    }));
    const models = mapCloudAgentModelCatalog([
        { displayName: 'First', id: 'dup' },
        { displayName: 'Second', id: 'dup' },
        { displayName: 'Blank', id: ' ' },
        {
            displayName: 'Odd',
            id: 'odd',
            parameters: [
                { id: 'effort', values: [{ value: 'x'.repeat(101) }] },
                { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
            ],
        },
        ...many,
    ]);
    expect(models[0]?.displayName).toBe('First');
    expect(models[1]).toMatchObject({
        effort: null,
        fast: { defaultValue: false },
        id: 'odd',
        order: 1,
    });
    expect(models).toHaveLength(200);
});

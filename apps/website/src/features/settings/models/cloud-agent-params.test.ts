import { expect, test } from 'bun:test';
import type { CloudAgentModel } from '@haus/api';
import { cloudAgentModelParamsView, settingWithParam } from './cloud-agent-params.ts';

const opus: CloudAgentModel = {
    description: null,
    displayName: 'Claude Opus 5.5',
    effort: {
        defaultValue: 'medium',
        options: [
            { displayName: 'Low', value: 'low' },
            { displayName: 'Medium', value: 'medium' },
            { displayName: 'High', value: 'high' },
        ],
        providerParamId: 'effort',
    },
    family: 'claude',
    fast: { defaultValue: false },
    id: 'claude-opus-5-5',
    order: 3,
};

test('unset params show the model defaults', () => {
    const view = cloudAgentModelParamsView(opus, {});

    expect(view.effort?.selected).toBe('medium');
    expect(view.effort?.options.filter((option) => option.isDefault).map((o) => o.value)).toEqual([
        'medium',
    ]);
    expect(view.fast).toEqual({ selected: false });
});

test('saved params show as chosen', () => {
    const view = cloudAgentModelParamsView(opus, { effort: 'high', fast: true });

    expect(view.effort?.selected).toBe('high');
    expect(view.fast).toEqual({ selected: true });
});

test('a saved effort the model no longer offers shows the default and is not resent', () => {
    const view = cloudAgentModelParamsView(opus, { effort: 'max' });

    expect(view.effort?.selected).toBe('medium');
    expect(settingWithParam(view, { fast: true })).toEqual({
        id: 'claude-opus-5-5',
        kind: 'model',
        params: { fast: true },
    });
});

test('a model without effort or fast offers neither control and drops saved ones', () => {
    const bare: CloudAgentModel = { ...opus, effort: null, fast: null };
    const view = cloudAgentModelParamsView(bare, { effort: 'high', fast: true });

    expect(view.effort).toBeNull();
    expect(view.fast).toBeNull();
    expect(view.params).toEqual({});
});

test('a change keeps the other param, and picking the default leaves the param unset', () => {
    const view = cloudAgentModelParamsView(opus, { effort: 'high', fast: true });

    expect(settingWithParam(view, { effort: 'low' })).toEqual({
        id: 'claude-opus-5-5',
        kind: 'model',
        params: { effort: 'low', fast: true },
    });
    expect(settingWithParam(view, { effort: 'medium' })).toEqual({
        id: 'claude-opus-5-5',
        kind: 'model',
        params: { fast: true },
    });
    expect(settingWithParam(view, { fast: false })).toEqual({
        id: 'claude-opus-5-5',
        kind: 'model',
        params: { effort: 'high' },
    });
});

test('Cursor naming no effort default shows no selection', () => {
    const view = cloudAgentModelParamsView(
        { ...opus, effort: opus.effort ? { ...opus.effort, defaultValue: null } : null },
        {}
    );

    expect(view.effort?.selected).toBeNull();
});

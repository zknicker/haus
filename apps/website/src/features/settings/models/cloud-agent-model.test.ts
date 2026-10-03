import { expect, test } from 'bun:test';
import type { CloudAgentModelCatalog, CloudAgentModelFamily } from '@haus/api';
import { autoModelKey, cloudAgentModelView, modelSettingForKey } from './cloud-agent-model.ts';

const catalog: CloudAgentModelCatalog = {
    models: [
        {
            description: 'Fast and capable',
            displayName: 'Composer 2',
            effort: null,
            family: 'composer',
            fast: null,
            id: 'composer-2',
            order: 0,
        },
        {
            description: null,
            displayName: 'GPT-5.6',
            effort: null,
            family: 'gpt',
            fast: null,
            id: 'gpt-5.6',
            order: 1,
        },
    ],
    refreshedAt: '2026-10-02T12:00:00.000Z',
};

test('Cursor default is the first option and selected by default', () => {
    const view = cloudAgentModelView({
        catalog,
        model: { kind: 'auto' },
        savedModelUnavailable: false,
    });

    expect(view.state).toBe('auto');
    expect(view.selectedKey).toBe(autoModelKey);
    expect(view.selectedLabel).toBe('Cursor default');
    expect(view.options.map((option) => option.label)).toEqual([
        'Cursor default',
        'GPT-5.6',
        'Composer 2',
    ]);
    expect(view.params).toBeNull();
    expect(view.pickable).toBe(true);
    expect(view.catalogMissing).toBe(false);
    expect(view.refreshedAt).toBe(catalog.refreshedAt);
});

test('a listed saved model reads by its display name', () => {
    const view = cloudAgentModelView({
        catalog,
        model: { id: 'gpt-5.6', kind: 'model', params: {} },
        savedModelUnavailable: false,
    });

    expect(view.state).toBe('model');
    expect(view.selectedKey).toBe('gpt-5.6');
    expect(view.selectedLabel).toBe('GPT-5.6');
    expect(view.options.some((option) => option.unavailable)).toBe(false);
});

test('an unlisted saved model shows by raw id and cannot be picked again', () => {
    const view = cloudAgentModelView({
        catalog,
        model: { id: 'retired-model', kind: 'model', params: {} },
        savedModelUnavailable: true,
    });

    expect(view.state).toBe('unavailable');
    expect(view.selectedLabel).toBe('retired-model');
    expect(view.options[1]).toEqual({
        description: null,
        id: 'retired-model',
        label: 'retired-model',
        searchText: 'retired-model retired-model',
        unavailable: true,
    });
    expect(view.params).toBeNull();
    expect(modelSettingForKey('retired-model', view)).toBeNull();
    expect(modelSettingForKey('composer-2', view)).toEqual({
        id: 'composer-2',
        kind: 'model',
        params: {},
    });
});

test('without a catalog only Cursor default exists, so the picker has nothing to offer', () => {
    const view = cloudAgentModelView({
        catalog: null,
        model: { kind: 'auto' },
        savedModelUnavailable: false,
    });

    expect(view.catalogMissing).toBe(true);
    expect(view.pickable).toBe(false);
    expect(view.refreshedAt).toBeNull();
    expect(view.options.map((option) => option.id)).toEqual([autoModelKey]);
});

test('a saved model with no catalog can still be switched back to Cursor default', () => {
    const view = cloudAgentModelView({
        catalog: null,
        model: { id: 'composer-2', kind: 'model', params: {} },
        savedModelUnavailable: true,
    });

    expect(view.state).toBe('unavailable');
    expect(view.pickable).toBe(true);
    expect(modelSettingForKey(autoModelKey, view)).toEqual({ kind: 'auto' });
});

test('an unknown key maps to no setting', () => {
    const view = cloudAgentModelView({
        catalog,
        model: { kind: 'auto' },
        savedModelUnavailable: false,
    });

    expect(modelSettingForKey('not-listed', view)).toBeNull();
    expect(modelSettingForKey(null, view)).toBeNull();
});

test('sections follow family order, Cursor order within a family, GLM and Kimi under Other', () => {
    const model = (id: string, family: CloudAgentModelFamily, order: number) => ({
        description: null,
        displayName: id,
        effort: null,
        family,
        fast: null,
        id,
        order,
    });
    const view = cloudAgentModelView({
        catalog: {
            models: [
                model('grok-4', 'grok', 0),
                model('opus-5', 'claude', 3),
                model('kimi-k3', 'kimi', 1),
                model('sonnet-5', 'claude', 2),
                model('glm-5', 'glm', 4),
                model('codex-5', 'gpt', 5),
            ],
            refreshedAt: '2026-10-02T12:00:00.000Z',
        },
        model: { kind: 'auto' },
        savedModelUnavailable: false,
    });

    expect(
        view.sections.map((section) => [section.title, section.options.map((o) => o.id)])
    ).toEqual([
        [null, [autoModelKey]],
        ['Claude', ['sonnet-5', 'opus-5']],
        ['GPT', ['codex-5']],
        ['Grok', ['grok-4']],
        ['Other', ['kimi-k3', 'glm-5']],
    ]);
    expect(view.options.find((o) => o.id === 'codex-5')?.searchText).toBe('codex-5 codex-5');
});

test('a listed saved model carries its params view', () => {
    const view = cloudAgentModelView({
        catalog,
        model: { id: 'gpt-5.6', kind: 'model', params: {} },
        savedModelUnavailable: false,
    });

    expect(view.params?.model.id).toBe('gpt-5.6');
    expect(view.params?.effort).toBeNull();
    expect(view.params?.fast).toBeNull();
});

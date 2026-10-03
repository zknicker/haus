import { expect, test } from 'bun:test';
import type { CloudAgentModelCatalog } from '@haus/api';
import { autoModelKey, cloudAgentModelView, modelSettingForKey } from './cloud-agent-model.ts';

const catalog: CloudAgentModelCatalog = {
    models: [
        { description: 'Fast and capable', displayName: 'Composer 2', id: 'composer-2' },
        { description: null, displayName: 'GPT-5.6', id: 'gpt-5.6' },
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
        'Composer 2',
        'GPT-5.6',
    ]);
    expect(view.pickable).toBe(true);
    expect(view.catalogMissing).toBe(false);
    expect(view.refreshedAt).toBe(catalog.refreshedAt);
});

test('a listed saved model reads by its display name', () => {
    const view = cloudAgentModelView({
        catalog,
        model: { id: 'gpt-5.6', kind: 'model' },
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
        model: { id: 'retired-model', kind: 'model' },
        savedModelUnavailable: true,
    });

    expect(view.state).toBe('unavailable');
    expect(view.selectedLabel).toBe('retired-model');
    expect(view.options[1]).toEqual({
        description: null,
        id: 'retired-model',
        label: 'retired-model',
        unavailable: true,
    });
    expect(modelSettingForKey('retired-model', view)).toBeNull();
    expect(modelSettingForKey('composer-2', view)).toEqual({ id: 'composer-2', kind: 'model' });
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
        model: { id: 'composer-2', kind: 'model' },
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

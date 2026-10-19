import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendedPresets } from './connection-presets.ts';

test('Factory is recommended until the Server has a Factory account', () => {
    const factory = (connections: { preset: 'factory' | 'x' | null }[]) =>
        recommendedPresets(connections).find((preset) => preset.id === 'factory');

    assert.deepEqual(factory([]), {
        description: 'Claim requests, run design routines, and review designs in Factory.',
        id: 'factory',
        name: 'Factory',
    });
    assert.equal(factory([{ preset: 'x' }, { preset: null }])?.name, 'Factory');
    assert.equal(factory([{ preset: 'factory' }]), undefined);
    assert.equal(
        recommendedPresets([{ preset: 'factory' }]).some((preset) => preset.id === 'x'),
        true
    );
});

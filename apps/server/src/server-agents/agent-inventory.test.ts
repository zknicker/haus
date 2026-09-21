import { expect, test } from 'bun:test';
import type { ComputerInventory } from '@haus/api';
import { assertRuntimeModelReported } from './agent-inventory.ts';

const inventory: ComputerInventory = {
    runtimes: [
        {
            id: 'claude-code',
            label: 'Claude Code',
            models: [
                { id: 'opus', label: 'Opus', reasoningEfforts: ['medium', 'max'] },
                { id: 'haiku', label: 'Haiku', reasoningEfforts: ['default'] },
                { id: 'legacy', label: 'Legacy' },
            ],
        },
    ],
};

test('validates effort against the selected model on its assigned Computer', () => {
    expect(() => assertRuntimeModelReported(inventory, 'claude-code', 'opus', 'max')).not.toThrow();
    expect(() => assertRuntimeModelReported(inventory, 'claude-code', 'haiku', 'max')).toThrow(
        'does not support reasoning effort'
    );
    expect(() =>
        assertRuntimeModelReported(inventory, 'claude-code', 'haiku', 'default')
    ).not.toThrow();
});

test('old inventories permit only the original effort contract', () => {
    expect(() =>
        assertRuntimeModelReported(inventory, 'claude-code', 'legacy', 'medium')
    ).not.toThrow();
    expect(() => assertRuntimeModelReported(inventory, 'claude-code', 'legacy', 'max')).toThrow(
        'does not support reasoning effort'
    );
});

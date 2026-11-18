import { expect, test } from 'bun:test';
import type { Agent } from '@haus/api';
import type { ReportedComputer } from './agent-creation-contract.ts';
import { resolveAgentCreationDefaults } from './agent-creation-defaults.ts';

const reported: ReportedComputer[] = [
    {
        id: 'cmp_cove',
        inventory: {
            runtimes: [
                {
                    id: 'codex',
                    label: 'Codex',
                    models: [{ id: 'gpt-5.6-sol', label: 'Sol' }],
                },
            ],
        },
        label: 'Cove Computer',
    },
];

test('uses Cove current execution settings when the inventory still reports them', () => {
    const defaults = resolveAgentCreationDefaults(reported, [
        {
            computerId: 'cmp_cove',
            desiredModelId: 'gpt-5.6-sol',
            desiredReasoningEffort: 'high',
            desiredRuntimeId: 'codex',
            factoryKind: 'cove',
        } as Agent,
    ]);

    expect(defaults).toEqual({
        computerId: 'cmp_cove',
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        runtimeId: 'codex',
    });
});

test('falls back to the first current inventory when Cove settings are stale', () => {
    const defaults = resolveAgentCreationDefaults(reported, [
        {
            computerId: 'cmp_missing',
            desiredModelId: 'missing-model',
            desiredReasoningEffort: 'low',
            desiredRuntimeId: 'missing-runtime',
            factoryKind: 'cove',
        } as Agent,
    ]);

    expect(defaults).toEqual({
        computerId: 'cmp_cove',
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'low',
        runtimeId: 'codex',
    });
});

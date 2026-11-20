import { expect, test } from 'bun:test';
import type { Agent } from '@haus/api';
import type { ReportedComputer } from './agent-creation-contract.ts';
import { resolveAgentCreationDefaults } from './agent-creation-defaults.ts';

const reported: ReportedComputer[] = [
    {
        id: 'cmp_studio',
        inventory: {
            runtimes: [
                {
                    id: 'codex',
                    label: 'Codex',
                    models: [{ id: 'gpt-5.6-sol', label: 'Sol' }],
                },
            ],
        },
        label: 'Studio Computer',
    },
];

test('uses the first Agent’s execution settings when the inventory still reports them', () => {
    const defaults = resolveAgentCreationDefaults(reported, [
        {
            computerId: 'cmp_studio',
            desiredModelId: 'gpt-5.6-sol',
            desiredReasoningEffort: 'high',
            desiredRuntimeId: 'codex',
        } as Agent,
    ]);

    expect(defaults).toEqual({
        computerId: 'cmp_studio',
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        runtimeId: 'codex',
    });
});

test('falls back to the first current inventory when the first Agent’s settings are stale', () => {
    const defaults = resolveAgentCreationDefaults(reported, [
        {
            computerId: 'cmp_missing',
            desiredModelId: 'missing-model',
            desiredReasoningEffort: 'low',
            desiredRuntimeId: 'missing-runtime',
        } as Agent,
    ]);

    expect(defaults).toEqual({
        computerId: 'cmp_studio',
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'low',
        runtimeId: 'codex',
    });
});

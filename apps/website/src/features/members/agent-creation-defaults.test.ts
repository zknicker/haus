import { expect, test } from 'bun:test';
import type { Agent } from '@haus/api';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import type { ReportedComputer } from './agent-creation-contract.ts';
import { creatableComputers, resolveAgentCreationDefaults } from './agent-creation-defaults.ts';

type Computer = HausOutputs['computer']['list'][number];

const runnerModels = [
    { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] },
];

test('offers only the Computers the person attached', () => {
    const computers = [
        { attachedByCurrentUser: false, id: 'cmp_theirs', name: 'Their Laptop' },
        { attachedByCurrentUser: true, id: 'cmp_mine', name: 'My Studio' },
    ] as Computer[];

    const offered = creatableComputers(computers, runnerModels);

    expect(offered.map((computer) => [computer.id, computer.label])).toEqual([
        ['cmp_mine', 'My Studio'],
    ]);
    expect(resolveAgentCreationDefaults(offered, []).computerId).toBe('cmp_mine');
});

test('offers nothing when the person attached no Computer', () => {
    const computers = [
        { attachedByCurrentUser: false, id: 'cmp_theirs', name: 'Their Laptop' },
    ] as Computer[];

    const offered = creatableComputers(computers, runnerModels);

    expect(offered).toEqual([]);
    expect(resolveAgentCreationDefaults(offered, []).computerId).toBe('');
});

test('does not default to a Computer the person did not attach, even the first Agent’s', () => {
    const computers = [
        { attachedByCurrentUser: false, id: 'cmp_theirs', name: 'Their Laptop' },
        { attachedByCurrentUser: true, id: 'cmp_mine', name: 'My Studio' },
    ] as Computer[];

    const defaults = resolveAgentCreationDefaults(creatableComputers(computers, runnerModels), [
        { computerId: 'cmp_theirs', desiredRuntimeId: 'codex' } as Agent,
    ]);

    expect(defaults.computerId).toBe('cmp_mine');
});

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

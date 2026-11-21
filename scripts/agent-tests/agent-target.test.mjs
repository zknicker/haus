import { describe, expect, test } from 'bun:test';
import { pickAgentTarget } from './provisioner.mjs';

const codexComputer = { health: 'healthy', id: 'cmp_1' };

const runnerModels = [
    { id: 'claude-code', label: 'Claude', models: [{ id: 'claude-opus-5-5', label: 'Opus' }] },
    {
        id: 'codex',
        label: 'ChatGPT',
        models: [
            { id: 'gpt-6.1-sol', label: 'Sol' },
            { id: 'gpt-6.1-terra', label: 'Terra' },
        ],
    },
];

describe('agent target', () => {
    test('reads runtime and model from the runner catalog, not the Computer', () => {
        expect(pickAgentTarget([codexComputer], runnerModels)).toEqual({
            computerId: 'cmp_1',
            modelId: 'gpt-6.1-terra',
            runtimeId: 'codex',
        });
        expect(
            pickAgentTarget([codexComputer], runnerModels, {
                modelHint: 'opus',
                runtimeId: 'claude-code',
            })?.modelId
        ).toBe('claude-opus-5-5');
    });

    test('needs an attached Computer and a runner catalog with the model', () => {
        expect(pickAgentTarget([{ ...codexComputer, health: 'offline' }], runnerModels)).toBeNull();
        expect(pickAgentTarget([codexComputer], null)).toBeNull();
        expect(pickAgentTarget([codexComputer], runnerModels, { modelHint: 'luna' })).toBeNull();
        expect(pickAgentTarget([], runnerModels)).toBeNull();
    });

    test('prefers a healthy Computer over a degraded one', () => {
        const degraded = { ...codexComputer, health: 'degraded', id: 'cmp_degraded' };
        expect(pickAgentTarget([degraded, codexComputer], runnerModels)?.computerId).toBe('cmp_1');
    });
});

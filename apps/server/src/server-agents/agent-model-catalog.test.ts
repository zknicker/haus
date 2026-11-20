import { expect, test } from 'bun:test';
import type { AgentReasoningEffort } from '@haus/api';
import { computerModelCatalog, inheritedModel } from './agent-model-catalog.ts';

const runner = {
    kind: 'runner' as const,
    runtimes: () => [
        {
            id: 'codex',
            label: 'ChatGPT',
            models: [
                {
                    id: 'gpt-6.1-sol',
                    label: 'GPT-6.1 Sol',
                    reasoningEfforts: ['low' as const, 'high' as const],
                },
                { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
            ],
        },
        {
            id: 'claude-code',
            label: 'Claude',
            models: [{ id: 'claude-opus-5-5', label: 'Opus 5.5' }],
        },
    ],
};

test('an inherited model the runner no longer offers maps to the first model of its provider', () => {
    expect(
        inheritedModel(runner, {
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'medium' as AgentReasoningEffort,
            runtimeId: 'codex',
        })
    ).toEqual({ modelId: 'gpt-6.1-sol', reasoningEffort: 'low', runtimeId: 'codex' });
    expect(
        inheritedModel(runner, {
            modelId: 'claude-opus',
            reasoningEffort: 'high' as AgentReasoningEffort,
            runtimeId: 'claude',
        })
    ).toEqual({ modelId: 'claude-opus-5-5', reasoningEffort: 'high', runtimeId: 'claude-code' });
});

test('an offered model, an unknown provider, and the Computer loop keep the inherited model', () => {
    const offered = { modelId: 'gpt-6-luna', reasoningEffort: 'high' as const, runtimeId: 'codex' };
    const unknown = {
        modelId: 'grok-3',
        reasoningEffort: 'high' as const,
        runtimeId: 'grok-build',
    };
    expect(inheritedModel(runner, offered)).toBe(offered);
    expect(inheritedModel(runner, unknown)).toBe(unknown);
    expect(inheritedModel(computerModelCatalog, unknown)).toBe(unknown);
});

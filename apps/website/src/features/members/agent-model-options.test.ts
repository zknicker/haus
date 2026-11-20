import { expect, test } from 'bun:test';
import type { ComputerRuntime } from '@haus/api';
import {
    agentModelOptions,
    agentModelSections,
    contextWindowLabel,
} from './agent-model-options.ts';

const catalog: ComputerRuntime[] = [
    {
        id: 'claude-code',
        label: 'Claude',
        models: [{ contextWindow: 1_000_000, id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }],
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        models: [
            { contextWindow: 262_144, id: 'moonshotai/kimi-k3.1-pro', label: 'Kimi K3.1 Pro' },
            { contextWindow: 1_048_576, id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
        ],
    },
];

test('models of providers without an enabled connection are offered but not connected', () => {
    const options = agentModelOptions(catalog, [
        { enabled: true, provider: 'claude' },
        { enabled: false, provider: 'openrouter' },
    ]);

    expect(options.map((option) => [option.key, option.connected])).toEqual([
        ['claude-code::claude-opus-5-5', true],
        ['openrouter::moonshotai/kimi-k3.1-pro', false],
        ['openrouter::deepseek/deepseek-v4-pro', false],
    ]);
    expect(agentModelOptions(catalog, null).every((option) => option.connected)).toBe(true);
});

test('sections group by provider in catalog order, or list every model by name', () => {
    const options = agentModelOptions(catalog, null);

    expect(
        agentModelSections(options, 'provider').map((section) => [
            section.title,
            section.options.map((option) => option.label),
        ])
    ).toEqual([
        ['Claude', ['Claude Opus 5.5']],
        ['OpenRouter', ['Kimi K3.1 Pro', 'DeepSeek V4 Pro']],
    ]);
    expect(
        agentModelSections(options, 'flat').map((section) => [
            section.title,
            section.options.map((option) => option.label),
        ])
    ).toEqual([[null, ['Claude Opus 5.5', 'DeepSeek V4 Pro', 'Kimi K3.1 Pro']]]);
});

test('context windows read in thousands or millions of tokens', () => {
    expect([1_000_000, 1_048_576, 272_000, 262_144].map(contextWindowLabel)).toEqual([
        '1M',
        '1M',
        '272K',
        '262K',
    ]);
});

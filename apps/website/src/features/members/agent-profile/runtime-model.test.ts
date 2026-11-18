import { expect, test } from 'bun:test';
import {
    isRuntimeConfigDraftAvailable,
    resolveRuntimeConfig,
    runtimeConfigStatusLabel,
} from './runtime-model.ts';

const runtimes = [
    {
        id: 'claude-code',
        label: 'Claude Code',
        models: [
            { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
            { id: 'claude-sonnet-4-1', label: 'Claude Sonnet 4.1' },
        ],
    },
];

test('resolves only the Agent desired runtime and model', () => {
    const resolved = resolveRuntimeConfig(
        { desiredModelId: 'missing', desiredRuntimeId: 'claude-code' },
        runtimes
    );

    expect(resolved.runtimeLabel).toBe('Claude Code');
    expect(resolved.model).toBeNull();
    expect(resolved.modelLabel).toBe('missing');
});

test('allows saving only a model reported by the selected runtime', () => {
    expect(
        isRuntimeConfigDraftAvailable(
            { modelId: 'claude-opus-4-1', runtimeId: 'claude-code', reasoningEffort: 'medium' },
            runtimes
        )
    ).toBe(true);
    expect(
        isRuntimeConfigDraftAvailable(
            { modelId: 'gpt-5.6-sol', runtimeId: 'claude-code', reasoningEffort: 'medium' },
            runtimes
        )
    ).toBe(false);
});

test('uses plain status language and explains offline pending config', () => {
    expect(runtimeConfigStatusLabel({ status: 'applied' }, 'healthy')).toBe('Current');
    expect(runtimeConfigStatusLabel({ status: 'degraded' }, 'healthy')).toBe('Needs attention');
    expect(runtimeConfigStatusLabel({ status: 'pending' }, 'offline')).toBe(
        'Applies when Computer reconnects'
    );
    expect(runtimeConfigStatusLabel({ status: 'pending' }, 'update-required')).toBe(
        'Waiting for Computer update'
    );
});

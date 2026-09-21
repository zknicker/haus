import { expect, test } from 'bun:test';
import type { ComputerInventory } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { isRuntimeConfigDraftAvailable } from './agent-profile/runtime-model.ts';
import { ReasoningSelect, supportedReasoningEffort } from './reasoning-select.tsx';

const models: ComputerInventory['runtimes'][number]['models'] = [
    {
        id: 'opus',
        label: 'Opus',
        defaultReasoningEffort: 'medium',
        reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    },
    {
        id: 'haiku',
        label: 'Haiku',
        defaultReasoningEffort: 'default',
        reasoningEfforts: ['default'],
    },
];

test('preserves supported effort and replaces unsupported effort when models change', () => {
    expect(supportedReasoningEffort(models[0], 'max')).toBe('max');
    expect(supportedReasoningEffort(models[1], 'max')).toBe('default');
    expect(supportedReasoningEffort({ id: 'legacy', label: 'Legacy' }, 'max')).toBe('medium');
    expect(supportedReasoningEffort(models[0], 'default')).toBe('medium');
});

test('saving requires the model to report the selected effort', () => {
    const runtimes = [{ id: 'claude-code', label: 'Claude Code', models }];
    expect(
        isRuntimeConfigDraftAvailable(
            { runtimeId: 'claude-code', modelId: 'opus', reasoningEffort: 'max' },
            runtimes
        )
    ).toBe(true);
    expect(
        isRuntimeConfigDraftAvailable(
            { runtimeId: 'claude-code', modelId: 'haiku', reasoningEffort: 'max' },
            runtimes
        )
    ).toBe(false);
});

test('models without an effort control are explicitly not configurable', () => {
    const markup = renderToStaticMarkup(
        <ReasoningSelect model={models[1]} onChange={() => undefined} value="default" />
    );
    expect(markup).toContain('Not configurable');
    expect(markup).toContain('Reasoning effort');
    expect(markup).toContain('disabled');
});

test('supported models select a concrete level without a runtime-default option', () => {
    const markup = renderToStaticMarkup(
        <ReasoningSelect model={models[0]} onChange={() => undefined} value="medium" />
    );
    expect(markup).toContain('Medium');
    expect(markup).not.toContain('Runtime default');
    expect(markup).not.toContain('Not configurable');
});

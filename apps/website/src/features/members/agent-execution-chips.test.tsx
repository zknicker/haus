import { expect, test } from 'bun:test';
import type { AgentReasoningEffort } from '@haus/api';
import { LowSignalIcon, MediumSignalIcon, SignalFull02Icon } from '@hugeicons/core-free-icons';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from '../../components/ui/icon.tsx';
import { AgentExecutionChips } from './agent-execution-chips.tsx';
import { testAgent } from './agent-fixtures.ts';
import {
    resolveAgentHoverExecution,
    resolveAgentHoverModelChange,
} from './agent-hover-execution.ts';

test('combines runtime and model while presenting the exact reasoning scale', () => {
    const markup = renderToStaticMarkup(
        <AgentExecutionChips
            modelLabel="GPT-5.6 Terra"
            reasoningEffort="medium"
            runtimeId="codex"
            runtimeLabel="Codex"
        />
    );

    expect(markup.match(/chip--sm/g)).toHaveLength(2);
    expect(markup).toContain('Codex · GPT-5.6 Terra');
    expect(markup).toContain('aria-label="Runtime: Codex; model: GPT-5.6 Terra"');
    expect(markup).toContain('Medium');
    expect(markup).toContain('data-reasoning-effort="medium"');
    expect(markup).toContain('text-reasoning-medium');
    expect(markup).toContain('<svg');
});

test('Agent hover execution never substitutes desired state for the applied configuration', () => {
    expect(
        resolveAgentHoverExecution({
            effectiveModelId: 'gpt-5.6-terra',
            effectiveReasoningEffort: 'low',
            effectiveRuntimeId: 'codex',
            status: 'pending',
        })
    ).toEqual({
        kind: 'effective',
        modelId: 'gpt-5.6-terra',
        reasoningEffort: 'low',
        runtimeId: 'codex',
    });

    expect(
        resolveAgentHoverExecution({
            effectiveModelId: null,
            effectiveReasoningEffort: null,
            effectiveRuntimeId: null,
            status: 'pending',
        })
    ).toEqual({ kind: 'unavailable', label: 'Configuration pending' });
});

test('reasoning intensity uses a distinct signal icon and cool-to-hot tone for each effort', () => {
    const efforts = [
        { effort: 'low', icon: LowSignalIcon, tone: 'text-reasoning-low' },
        { effort: 'medium', icon: MediumSignalIcon, tone: 'text-reasoning-medium' },
        { effort: 'high', icon: SignalFull02Icon, tone: 'text-reasoning-high' },
    ] satisfies {
        effort: AgentReasoningEffort;
        icon: Parameters<typeof Icon>[0]['icon'];
        tone: string;
    }[];

    for (const { effort, icon, tone } of efforts) {
        const markup = renderToStaticMarkup(
            <AgentExecutionChips
                modelLabel="Model"
                reasoningEffort={effort}
                runtimeId="codex"
                runtimeLabel="Codex"
            />
        );

        expect(markup).toContain(`data-reasoning-effort="${effort}"`);
        expect(markup).toContain(tone);
        expect(markup).toContain(
            renderToStaticMarkup(
                <Icon className={`size-3.5 ${tone}`} icon={icon} strokeWidth={2} />
            )
        );
    }
});

test('hover names a saved model switch until the Computer confirms it', () => {
    const pending = testAgent({ desiredModelId: 'model_two', status: 'pending' });
    expect(resolveAgentHoverModelChange(pending)).toBe('next turn');
    expect(resolveAgentHoverModelChange({ ...pending, availability: 'working' })).toBe('next turn');
    expect(resolveAgentHoverModelChange({ ...pending, availability: 'offline' })).toBe(
        'when Computer reconnects'
    );
    expect(resolveAgentHoverModelChange({ ...pending, status: 'degraded' })).toBe(
        'needs attention'
    );
    expect(resolveAgentHoverModelChange({ ...pending, effectiveModelId: 'model_two' })).toBeNull();
});

test('hover handles runtime switches without mislabeling initial setup or effort changes', () => {
    expect(resolveAgentHoverModelChange(testAgent({ desiredRuntimeId: 'runtime_two' }))).toBe(
        'next turn'
    );
    expect(resolveAgentHoverModelChange(testAgent({ desiredReasoningEffort: 'high' }))).toBeNull();
    expect(
        resolveAgentHoverModelChange(
            testAgent({ effectiveModelId: null, effectiveRuntimeId: null, status: 'pending' })
        )
    ).toBeNull();
});

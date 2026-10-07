import { expect, test } from 'bun:test';
import type { Agent } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReportedComputer } from './agent-creation-contract.ts';
import { AgentCreationForm } from './agent-creation-form.tsx';

const reported: ReportedComputer[] = [
    {
        id: 'cmp_laptop',
        inventory: {
            runtimes: [
                {
                    id: 'claude-code',
                    label: 'Claude Code',
                    models: [{ id: 'opus', label: 'Opus' }],
                },
            ],
        },
        label: 'Laptop',
    },
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

const cove = {
    computerId: 'cmp_cove',
    desiredModelId: 'gpt-5.6-sol',
    desiredReasoningEffort: 'high',
    desiredRuntimeId: 'codex',
    factoryKind: 'cove',
} as unknown as Agent;

test('a fresh form starts empty on the setup Cove already runs on', () => {
    const markup = renderToStaticMarkup(
        <AgentCreationForm
            agents={[cove]}
            error={null}
            isPending={false}
            onCreated={() => undefined}
            onSubmit={async () => ({ agentId: 'agt_1234567890abcdef' })}
            reported={reported}
        />
    );

    expect(markup).toContain('Cove Computer');
    expect(markup).toContain('Codex');
    expect(markup).toContain('Sol');
    expect(markup).toContain('Reasoning effort');
    expect(markup).toContain('aria-label="Upload avatar"');
    expect(markup).toContain('value=""');
    // The signature emoji is optional and shows the default until one is picked.
    expect(markup).toContain('Signature emoji');
    expect(markup).toContain('👀');
});

test('a Server without Cove falls back to the first Computer that reports an inventory', () => {
    const markup = renderToStaticMarkup(
        <AgentCreationForm
            agents={[]}
            error={null}
            isPending={false}
            onCreated={() => undefined}
            onSubmit={async () => ({ agentId: 'agt_1234567890abcdef' })}
            reported={reported}
        />
    );

    expect(markup).toContain('Laptop');
    expect(markup).toContain('Claude Code');
});

test('keeps the form mounted with a recoverable creation error', () => {
    const markup = renderToStaticMarkup(
        <AgentCreationForm
            agents={[]}
            error={{ message: 'The Computer no longer reports this model.' }}
            isPending={false}
            onCreated={() => undefined}
            onSubmit={async () => ({ agentId: 'agt_1234567890abcdef' })}
            reported={reported}
        />
    );

    expect(markup).toContain('The Computer no longer reports this model.');
    expect(markup).toContain('Create Agent');
});

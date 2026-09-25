import { expect, test } from 'bun:test';
import type { MessageRoutingAudit } from '@haus/api';
import { Popover } from '@heroui/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoutingDecisionPanel } from './routing-decision-panel.tsx';
import { routingExplanation, routingOutcomeLabel } from './routing-labels.ts';

const audit: MessageRoutingAudit = {
    bypassReason: null,
    candidateAgentIds: ['agt_juniper', 'agt_cove'],
    choice: 'agt_juniper',
    confidence: 0.9,
    elapsedMs: 420,
    model: 'jev',
    outcome: 'narrow',
    probability: 0.8,
    promptVersion: 'v1',
    recipientAgentIds: ['agt_juniper'],
    threshold: 0.5,
};

test('a sole-agent bypass reads as addressed with its reason', () => {
    const markup = renderToStaticMarkup(
        <Popover>
            <RoutingDecisionPanel
                agents={[{ displayName: 'Juniper', id: 'agt_juniper' }]}
                audit={{
                    ...audit,
                    bypassReason: 'sole',
                    candidateAgentIds: ['agt_juniper'],
                    choice: null,
                    confidence: null,
                    elapsedMs: null,
                    model: null,
                    outcome: 'bypass',
                    probability: null,
                    promptVersion: null,
                    threshold: null,
                }}
            />
        </Popover>
    );
    expect(markup).toContain('Addressed');
    expect(markup).toContain('sole agent and human');
});

test('a mention-scope narrowing reads as narrowed with the excluded agent and scope choice', () => {
    const markup = renderToStaticMarkup(
        <Popover>
            <RoutingDecisionPanel
                agents={[
                    { displayName: 'Juniper', id: 'agt_juniper' },
                    { displayName: 'Cove', id: 'agt_cove' },
                ]}
                audit={{
                    ...audit,
                    bypassReason: 'mention',
                    choice: 'mentioned',
                    outcome: 'mentioned',
                    promptVersion: 'mention-v2',
                }}
            />
        </Popover>
    );
    expect(markup).toContain('Narrowed');
    expect(markup).toContain('Mentioned agents only');
    expect(markup).toContain('for the mentioned agents alone');
    expect(markup).toContain('Cove');
});

const renderPanel = (overrides: Partial<MessageRoutingAudit>) =>
    renderToStaticMarkup(
        <Popover>
            <RoutingDecisionPanel
                agents={[{ displayName: 'Juniper', id: 'agt_juniper' }]}
                audit={{
                    ...audit,
                    recipientAgentIds: ['agt_juniper', 'agt_cove'],
                    threshold: 0.8,
                    ...overrides,
                }}
            />
        </Popover>
    );
const mentionScope = { bypassReason: 'mention', promptVersion: 'mention-v2' } as const;

test('an uncertain mention-scope judgment names the confidence threshold', () => {
    const markup = renderPanel({
        ...mentionScope,
        choice: 'mentioned',
        confidence: 0.79,
        outcome: 'uncertain',
    });
    expect(markup).toContain('Normal delivery');
    expect(markup).toContain('below the threshold');
    expect(markup).toContain('80% confidence');
});

test('confident non-narrowing answers say what Jev judged, not uncertainty', () => {
    for (const [overrides, copy] of [
        [{ choice: 'multiple' }, 'Jev judged this was for everyone in the channel.'],
        [{ choice: 'human' }, 'Jev judged this was for a human.'],
        [{ ...mentionScope, choice: 'others' }, 'Jev judged this was for other agents too'],
    ] as const) {
        const markup = renderPanel({ ...overrides, confidence: 0.99, outcome: 'kept' });
        expect(markup).toContain('Normal delivery');
        expect(markup).toContain(copy);
        expect(markup).not.toContain('below the threshold');
    }
});

test('a stored pre-kept uncertain audit with a confident shared choice reads as kept', () => {
    const legacy: MessageRoutingAudit = {
        ...audit,
        choice: 'multiple',
        confidence: 0.99,
        outcome: 'uncertain',
        threshold: 0.9,
    };
    expect(routingOutcomeLabel(legacy)).toBe('Jev: for everyone');
    expect(routingExplanation(legacy)).toContain('for everyone in the channel');
    expect(routingOutcomeLabel({ ...legacy, confidence: 0.85 })).toBe('uncertain');
});

import { expect, test } from 'bun:test';
import type { MessageRoutingAudit } from '@haus/api';
import { Popover } from '@heroui/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoutingDecisionPanel } from './routing-decision-panel.tsx';

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

test('an uncertain mention-scope judgment explains that normal delivery was kept', () => {
    const markup = renderToStaticMarkup(
        <Popover>
            <RoutingDecisionPanel
                agents={[{ displayName: 'Juniper', id: 'agt_juniper' }]}
                audit={{
                    ...audit,
                    bypassReason: 'mention',
                    choice: 'others',
                    outcome: 'uncertain',
                    promptVersion: 'mention-v2',
                    recipientAgentIds: ['agt_juniper', 'agt_cove'],
                }}
            />
        </Popover>
    );
    expect(markup).toContain('Normal delivery');
    expect(markup).toContain('Other agents too');
    expect(markup).toContain('for the mentioned agents alone');
});

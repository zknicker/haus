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
    expectsReply: 0.12,
    model: 'jev',
    outcome: 'narrow',
    probability: 0.8,
    promptVersion: 'v1',
    recipientAgentIds: ['agt_juniper'],
    threshold: 0.5,
};

test.each([
    [0.12, 'Reply expected</dt><dd class="text-right tabular-nums">12%'],
    [null, 'Reply expected</dt><dd class="text-right tabular-nums">Not recorded'],
] as const)('reply expectation %p reads as a quiet row', (expectsReply, row) => {
    const markup = renderToStaticMarkup(
        <Popover>
            <RoutingDecisionPanel agents={[]} audit={{ ...audit, expectsReply }} />
        </Popover>
    );
    expect(markup).toContain(row);
});

import { expect, test } from 'bun:test';
import type { AgentActivityEvent } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AgentActivityStrip } from './sidebar-agent-activity-strip.tsx';

test('keeps the activity strip shell mounted while its final row exits', () => {
    const markup = renderToStaticMarkup(
        <MemoryRouter>
            <AgentActivityStrip hiddenCount={0} rows={[]} slug="dev" />
        </MemoryRouter>
    );

    expect(markup).toContain('data-slot="agent-activity-strip"');
    expect(markup).not.toContain('data-agent-activity-row');
});

test('renders independently keyed Agent rows inside one coordinated list', () => {
    const markup = renderToStaticMarkup(
        <MemoryRouter>
            <AgentActivityStrip
                hiddenCount={0}
                rows={[
                    row('agt_blippy', 'run_blippy', 'thinking'),
                    row('agt_tiny', 'run_tiny', 'running_command'),
                ]}
                slug="dev"
            />
        </MemoryRouter>
    );

    expect(markup).toContain('data-agent-activity-row="agt_blippy"');
    expect(markup).toContain('data-agent-activity-label="Thinking…"');
    expect(markup).toContain('data-agent-activity-row="agt_tiny"');
    expect(markup).toContain('data-agent-activity-label="Running a command…"');
    expect(markup).toContain('px-2 py-1');
    expect(markup).not.toContain('w-full px-1');
});

function row(agentId: string, runId: string, category: AgentActivityEvent['category']) {
    return {
        activity: {
            agentId,
            category,
            id: `aev_${agentId}`,
            occurredAt: '2026-08-14T12:00:00.000Z',
            runStartedAt: null,
            phase: 'started' as const,
            position: 1,
            producer: 'server' as const,
            producerId: 'server',
            producerSequence: 1,
            runId,
            serverId: 'srv_dev',
        },
        agent: {
            avatarUrl: null,
            displayName: agentId,
            id: agentId,
            kind: 'fallback' as const,
        },
    };
}

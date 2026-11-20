import { expect, test } from 'bun:test';
import type { Agent, AgentLoop, ModelConnection } from '@haus/api';
import { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { renderWithTrpc } from '../../test-support/trpc-test-provider.tsx';
import { testConnection } from '../settings/models/connections/model-connection.fixture.ts';
import { testAgent } from './agent-fixtures.ts';
import { AgentRuntimeIssue } from './agent-runtime-issue.tsx';

const serverId = 'srv_1';
const grokAgent = testAgent({ desiredModelId: 'grok-4', serverId });
const pausedGrokAgent = testAgent({
    desiredModelId: 'grok-4',
    serverId,
    wakePause: {
        failureCount: 3,
        lastFailure: { at: '2026-11-19T11:00:00.000Z', code: null, kind: 'unknown' },
        nextProbeAt: '2026-11-19T13:00:00.000Z',
        pausedAt: '2026-11-19T11:00:00.000Z',
    },
});

function renderProfileWarning(
    connections: ModelConnection[],
    { agent = grokAgent, agentLoop = 'runner' }: { agent?: Agent; agentLoop?: AgentLoop } = {}
) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(getQueryKey(hausTrpc.computer.list, { serverId }, 'query'), []);
    queryClient.setQueryData(getQueryKey(hausTrpc.modelConnections.list, { serverId }, 'query'), {
        agentLoop,
        connections,
    });
    return renderWithTrpc(
        <MemoryRouter initialEntries={['/team-room']}>
            <Routes>
                <Route element={<AgentRuntimeIssue agent={agent} canRestart />} path=":slug" />
            </Routes>
        </MemoryRouter>,
        queryClient
    );
}

test('a Grok Agent with no xAI connection warns on its profile and links to Settings → Models', () => {
    const html = renderProfileWarning([testConnection()]);
    expect(html).toContain('>No xAI connection<');
    expect(html).toContain('href="/s/team-room/settings/models"');
    expect(html).toContain('>Connect one in Settings → Models<');
});

test('the warning is gone once the list holds an xAI connection', () => {
    const html = renderProfileWarning([
        testConnection(),
        testConnection({ authKind: 'oauth', id: 'mcn_grok', label: 'SuperGrok', provider: 'xai' }),
    ]);
    expect(html).toBe('');
});

test('an Agent on its Computer never warns about connections and keeps its wake pause with Restart', () => {
    const html = renderProfileWarning([], { agent: pausedGrokAgent, agentLoop: 'computer' });
    expect(html).not.toContain('connection');
    expect(html).toContain('data-testid="agent-wake-pause"');
    expect(html).toContain('>Paused after repeated failures<');
    expect(html).toContain('>Restart</button>');
});

test('on the runner a paused Agent with no connection shows both the fix and Restart', () => {
    const html = renderProfileWarning([], { agent: pausedGrokAgent });
    expect(html).toContain('>No xAI connection<');
    expect(html).toContain('data-testid="agent-wake-pause"');
    expect(html).toContain('>Restart</button>');
});

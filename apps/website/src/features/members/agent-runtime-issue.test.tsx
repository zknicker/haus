import { expect, test } from 'bun:test';
import type { ModelConnection } from '@haus/api';
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

function renderProfileWarning(connections: ModelConnection[]) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(getQueryKey(hausTrpc.computer.list, { serverId }, 'query'), []);
    queryClient.setQueryData(getQueryKey(hausTrpc.modelConnections.list, { serverId }, 'query'), {
        connections,
    });
    return renderWithTrpc(
        <MemoryRouter initialEntries={['/team-room']}>
            <Routes>
                <Route
                    element={<AgentRuntimeIssue agent={grokAgent} canRestart={false} />}
                    path=":slug"
                />
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

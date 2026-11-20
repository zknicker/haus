import { expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { renderWithTrpc } from '../../../test-support/trpc-test-provider.tsx';
import { testConnection } from '../../settings/models/connections/model-connection.fixture.ts';
import { testAgent } from '../agent-fixtures.ts';
import { AgentConnectionControl, AgentModelConnectionRow } from './agent-model-connection-row.tsx';

const connections = [
    testConnection({ id: 'mcn_team', label: 'Team plan' }),
    testConnection({ id: 'mcn_side', isDefault: false, label: 'Side plan', position: 1 }),
];

function closedValue(modelConnectionId: string | null) {
    const html = renderWithTrpc(
        <MemoryRouter>
            <AgentConnectionControl
                agent={{
                    desiredModelId: 'claude-sonnet-4-5',
                    displayName: 'Fen',
                    id: 'agent_1',
                    modelConnectionId,
                    serverId: 'srv_1',
                }}
                canEdit
                connections={connections}
            />
        </MemoryRouter>
    );
    return /data-slot="select-value"[^>]*>(.*?)<\/span><svg/u.exec(html)?.[1];
}

test('the closed connection select reads only the chosen name', () => {
    expect(closedValue(null)).toBe('Default');
    expect(closedValue('mcn_side')).toBe('Side plan');
});

test('a connections read that failed reads as an alert under the row title', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
    queryClient
        .getQueryCache()
        .build(queryClient, {
            queryKey: getQueryKey(hausTrpc.modelConnections.list, { serverId: 'srv_1' }, 'query'),
        })
        .setState({ error: new Error('The Server is unreachable.'), status: 'error' });
    const html = renderWithTrpc(
        <MemoryRouter>
            <AgentModelConnectionRow agent={testAgent({ serverId: 'srv_1' })} canEdit />
        </MemoryRouter>,
        queryClient
    );
    expect(html).toContain(
        '<div class="item-card__content" data-slot="item-card-content"><span class="item-card__title" data-slot="item-card-title">Connection</span><p class="text-danger mt-1 text-sm" data-selectable-text="" role="alert">The Server is unreachable.</p></div>'
    );
});

function rowWithList(agentLoop: 'computer' | 'runner') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    queryClient.setQueryData(
        getQueryKey(hausTrpc.modelConnections.list, { serverId: 'srv_1' }, 'query'),
        { agentLoop, connections: [] }
    );
    return renderWithTrpc(
        <MemoryRouter>
            <AgentModelConnectionRow agent={testAgent({ serverId: 'srv_1' })} canEdit />
        </MemoryRouter>,
        queryClient
    );
}

test('a Captain on its Device has no Connection row or separator; on the runner it has both', () => {
    expect(rowWithList('computer')).toBe('');
    const runner = rowWithList('runner');
    expect(runner).toContain('>Connection</span>');
    expect(runner.match(/role="separator"/gu)?.length).toBe(1);
});

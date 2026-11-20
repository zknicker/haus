import { expect, test } from 'bun:test';
import { MemoryRouter } from 'react-router-dom';
import { renderWithTrpc } from '../../../test-support/trpc-test-provider.tsx';
import { testConnection } from '../../settings/models/connections/model-connection.fixture.ts';
import { AgentConnectionControl } from './agent-model-connection-row.tsx';

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

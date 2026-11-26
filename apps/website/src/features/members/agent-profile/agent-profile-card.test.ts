import { expect, test } from 'bun:test';
import type { Agent } from '@haus/api';
import { agentCreatorName } from './agent-profile-card.tsx';

test('the profile names the Agent that created this one, or the human who did', () => {
    const cove = { displayName: 'Cove', id: 'agt_cove' } as Agent;
    const humanName = (userId: string) => (userId === 'usr_ada' ? 'Ada' : 'Human');

    expect(
        agentCreatorName({ createdByAgentId: 'agt_cove', createdByUserId: null }, [cove], humanName)
    ).toBe('Cove');
    expect(
        agentCreatorName({ createdByAgentId: null, createdByUserId: 'usr_ada' }, [], humanName)
    ).toBe('Ada');
    expect(
        agentCreatorName({ createdByAgentId: null, createdByUserId: null }, [cove], humanName)
    ).toBeNull();
    // A retired creator is gone from the directory; the line just says when.
    expect(
        agentCreatorName({ createdByAgentId: 'agt_gone', createdByUserId: null }, [cove], humanName)
    ).toBeNull();
});

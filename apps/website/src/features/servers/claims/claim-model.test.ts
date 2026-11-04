import { expect, test } from 'bun:test';
import { testAgent } from '../../members/agent-fixtures.ts';
import { claimAssigneeAvatarUrl, claimAssigneeName } from './claim-model.ts';

const agent = testAgent({
    avatarUrl: '/api/avatars/avt_fen',
    displayName: 'Fen',
    id: 'agent_owner',
});

test('names the assignee from the Agent directory', () => {
    expect(claimAssigneeName({ assigneeAgentId: 'agent_owner' }, [agent])).toBe('Fen');
    expect(claimAssigneeAvatarUrl({ assigneeAgentId: 'agent_owner' }, [agent])).toBe(
        '/api/avatars/avt_fen'
    );
});

test('an unassigned claim has no face, and a departed Agent keeps a stable label', () => {
    expect(claimAssigneeName({ assigneeAgentId: null }, [agent])).toBe('Unassigned');
    expect(claimAssigneeAvatarUrl({ assigneeAgentId: null }, [agent])).toBeNull();
    expect(claimAssigneeName({ assigneeAgentId: 'agent_gone12' }, [])).toBe('Agent gone12');
});

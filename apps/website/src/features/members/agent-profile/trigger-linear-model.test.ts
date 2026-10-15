import { expect, test } from 'bun:test';
import { linearGroupSummary, linearGroupTitle, linearProblemFix } from './trigger-linear-model.ts';

test('a group reads as its event, actions, and filters by display name', () => {
    const group = {
        actions: ['create', 'update'] as ('create' | 'update' | 'remove')[],
        delegates: [{ agent: 'agent_juniper' }],
        event: 'issue' as const,
        stateTo: ['state-review'],
        teams: ['team-des', 'team-ops'],
    };
    expect(linearGroupTitle(group)).toBe('Issue created or updated');
    expect(
        linearGroupSummary(group, { 'state-review': 'In Review', 'team-des': 'Design' }, (id) =>
            id === 'agent_juniper' ? 'Juniper' : id
        )
    ).toBe('To: In Review\nTeams: Design or team-ops\nDelegate: Juniper');
    expect(linearGroupSummary({ actions: ['update'], event: 'project' }, {}, (id) => id)).toBe(
        'Any'
    );
});

test('each problem names its fix', () => {
    expect(
        linearProblemFix('agent_access_revoked', { agentName: 'Juniper', workspaceName: 'Haus' })
    ).toContain('Give Juniper access');
});

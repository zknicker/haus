import { expect, test } from 'bun:test';
import { testAgent } from '../../members/agent-fixtures.ts';
import { liveAgentActorProfile, renamedAgentProfile } from './chat-actor-profiles.ts';

test('live Agent profiles point transcript avatars at live availability', () => {
    const agent = testAgent({
        availability: 'offline',
        avatarUrl: '/api/avatars/blippy',
        displayName: 'Blippy',
        handle: 'blippy',
        id: 'agt_blippy',
    });

    expect(liveAgentActorProfile(agent)).toMatchObject({
        deleted: false,
        id: 'agt_blippy',
        kind: 'agent',
        availability: { kind: 'live', serverId: agent.serverId },
    });
});

test('a Task agent reads by the name its chat gives it, even with no profile of its own', () => {
    const captain = liveAgentActorProfile(
        testAgent({ avatarUrl: '/api/avatars/blippy', displayName: 'Blippy', id: 'agt_task' })
    );
    expect(renamedAgentProfile('agt_task', captain, 'GPT-5.6 Sol')).toMatchObject({
        avatarUrl: null,
        id: 'agt_task',
        kind: 'agent',
        name: 'GPT-5.6 Sol',
    });
    expect(renamedAgentProfile('agt_task', null, 'GPT-5.6 Sol')).toEqual({
        availability: { kind: 'none' },
        avatarUrl: null,
        deleted: false,
        id: 'agt_task',
        isSelf: false,
        kind: 'agent',
        name: 'GPT-5.6 Sol',
    });
});

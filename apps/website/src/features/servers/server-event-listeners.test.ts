import { expect, test } from 'bun:test';
import { serverEventTargets, serverSlugFromPath } from './server-event-model.ts';

test('the open Server is observed before the Server list resolves', () => {
    expect(serverEventTargets([], { id: 'srv_open', slug: 'team-room' })).toEqual([
        { id: 'srv_open', slug: 'team-room' },
    ]);
    expect(
        serverEventTargets([{ id: 'srv_open', slug: 'team-room' }], {
            id: 'srv_open',
            slug: 'team-room',
        })
    ).toEqual([{ id: 'srv_open', slug: 'team-room' }]);
});

test('every observed Server carries the slug its detail read is cached under', () => {
    expect(
        serverEventTargets(
            [
                { id: 'srv_one', slug: 'team-room' },
                { id: 'srv_two', slug: 'lab' },
            ],
            null
        )
    ).toEqual([
        { id: 'srv_one', slug: 'team-room' },
        { id: 'srv_two', slug: 'lab' },
    ]);
});

test('Server paths identify the open Server independently of list state', () => {
    expect(serverSlugFromPath('/s/team-room')).toBe('team-room');
    expect(serverSlugFromPath('/s/team-room/members')).toBe('team-room');
    expect(serverSlugFromPath('/s')).toBeNull();
    expect(serverSlugFromPath('/invite/token')).toBeNull();
});

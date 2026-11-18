import { expect, test } from 'bun:test';
import type { ServerInvitation } from '@haus/api/membership';
import { sortInvitations } from './server-invitations.tsx';

function invitation(overrides: Partial<ServerInvitation>): ServerInvitation {
    return {
        createdAt: '2026-03-01T00:00:00.000Z',
        email: 'someone@example.invalid',
        expiresAt: '2026-03-08T00:00:00.000Z',
        id: 'inv_1',
        invitedByUserId: 'usr_1',
        status: 'pending',
        ...overrides,
    };
}

test('live invitations sort above terminal ones', () => {
    const sorted = sortInvitations([
        invitation({ id: 'accepted', status: 'accepted' }),
        invitation({ createdAt: '2026-02-01T00:00:00.000Z', id: 'pending', status: 'pending' }),
        invitation({ id: 'revoked', status: 'revoked' }),
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(['pending', 'accepted', 'revoked']);
});

test('invitations of one status sort newest first', () => {
    const sorted = sortInvitations([
        invitation({ createdAt: '2026-03-01T00:00:00.000Z', id: 'older' }),
        invitation({ createdAt: '2026-03-04T00:00:00.000Z', id: 'newest' }),
        invitation({ createdAt: '2026-03-02T00:00:00.000Z', id: 'newer' }),
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(['newest', 'newer', 'older']);
});

test('sorting leaves the source list untouched', () => {
    const source = [
        invitation({ id: 'accepted', status: 'accepted' }),
        invitation({ id: 'pending' }),
    ];

    sortInvitations(source);

    expect(source.map((entry) => entry.id)).toEqual(['accepted', 'pending']);
});

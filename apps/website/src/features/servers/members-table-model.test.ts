import { expect, test } from 'bun:test';
import type { ServerInvitation, ServerMember, ServerMemberDirectory } from '@haus/api/membership';
import { buildMemberRows } from './members-table-model.ts';

function member(overrides: Partial<ServerMember>) {
    return {
        avatarUrl: null,
        description: null,
        displayName: null,
        email: null,
        handle: null,
        joinedAt: '2026-01-01T00:00:00.000Z',
        role: 'member',
        timezone: null,
        userId: 'usr_x',
        ...overrides,
    } satisfies ServerMember;
}

function invitation(overrides: Partial<ServerInvitation>) {
    return {
        createdAt: '2026-03-01T00:00:00.000Z',
        email: 'someone@example.invalid',
        expiresAt: '2026-03-08T00:00:00.000Z',
        id: 'inv_1',
        invitedByUserId: 'usr_owner',
        status: 'pending',
        ...overrides,
    } satisfies ServerInvitation;
}

const directory: ServerMemberDirectory = {
    members: [
        member({ displayName: 'Zed', email: 'zed@example.invalid', userId: 'usr_zed' }),
        member({ displayName: 'Ada', role: 'admin', userId: 'usr_ada' }),
        member({ displayName: 'Owen', role: 'owner', userId: 'usr_owner' }),
        member({ displayName: 'Bea', userId: 'usr_bea' }),
    ],
    viewerRole: 'owner',
    viewerUserId: 'usr_owner',
};

const invitations = [
    invitation({
        createdAt: '2026-03-01T00:00:00.000Z',
        email: 'old@example.invalid',
        id: 'inv_old',
    }),
    invitation({ email: 'gone@example.invalid', id: 'inv_gone', status: 'revoked' }),
    invitation({
        createdAt: '2026-03-05T00:00:00.000Z',
        email: 'new@example.invalid',
        id: 'inv_new',
    }),
];

function names(query: string, role: Parameters<typeof buildMemberRows>[0]['role']) {
    return buildMemberRows({ directory, invitations, query, role }).map((row) => [
        row.name,
        row.status,
    ]);
}

test('members sort by rank then name, with open invitations after them', () => {
    expect(names('', 'all')).toEqual([
        ['Owen', 'owner'],
        ['Ada', 'admin'],
        ['Bea', 'member'],
        ['Zed', 'member'],
        ['new@example.invalid', 'pending'],
        ['old@example.invalid', 'pending'],
    ]);
});

test('the viewer is marked on their own row only', () => {
    const viewerRows = buildMemberRows({ directory, invitations: [], query: '', role: 'all' })
        .filter((row) => row.kind === 'member' && row.isViewer)
        .map((row) => row.name);
    expect(viewerRows).toEqual(['Owen']);
});

test('the role filter keeps one role, and Pending keeps only invitations', () => {
    expect(names('', 'member')).toEqual([
        ['Bea', 'member'],
        ['Zed', 'member'],
    ]);
    expect(names('', 'pending')).toEqual([
        ['new@example.invalid', 'pending'],
        ['old@example.invalid', 'pending'],
    ]);
});

test('search matches a name or an email, alongside the role filter', () => {
    expect(names('ZED@', 'all')).toEqual([['Zed', 'member']]);
    expect(names('new@', 'all')).toEqual([['new@example.invalid', 'pending']]);
    expect(names('ada', 'member')).toEqual([]);
});

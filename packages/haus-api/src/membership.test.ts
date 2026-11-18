import { expect, test } from 'bun:test';
import {
    canManageServerInvitations,
    requiresSlugConfirmation,
    resolveServerMemberAuthority,
    type ServerMemberAuthorityRequest,
    serverRoleSchema,
    syncHumanIdentityInputSchema,
} from './membership.ts';

test('profile synchronization cannot supply a verified email address', () => {
    const input = { name: 'Fixture', serverId: 'srv_fixture' };
    expect(syncHumanIdentityInputSchema.parse(input)).toEqual(input);
    expect(() =>
        syncHumanIdentityInputSchema.parse({ ...input, email: 'other@example.test' })
    ).toThrow();
});

const owner = 'usr_owner';
const secondOwner = 'usr_owner_two';
const admin = 'usr_admin';
const peerAdmin = 'usr_admin_two';
const member = 'usr_member';

function authority(overrides: Partial<ServerMemberAuthorityRequest> = {}) {
    return resolveServerMemberAuthority({
        action: { kind: 'remove' },
        actorRole: 'owner',
        actorUserId: owner,
        targetIsLastOwner: false,
        targetRole: 'member',
        targetUserId: member,
        ...overrides,
    });
}

test('a Server carries exactly the three human roles', () => {
    expect(serverRoleSchema.parse('owner')).toBe('owner');
    expect(serverRoleSchema.parse('admin')).toBe('admin');
    expect(serverRoleSchema.parse('member')).toBe('member');
    expect(() => serverRoleSchema.parse('guest')).toThrow();
});

test('Owners and Admins manage invitations; Members do not', () => {
    expect(canManageServerInvitations('owner')).toBe(true);
    expect(canManageServerInvitations('admin')).toBe(true);
    expect(canManageServerInvitations('member')).toBe(false);
});

test('an Admin manages Members, including promoting one to Admin', () => {
    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'admin' },
            actorRole: 'admin',
            actorUserId: admin,
        })
    ).toEqual({ allowed: true });
    expect(authority({ actorRole: 'admin', actorUserId: admin })).toEqual({ allowed: true });
});

test('an Admin cannot act on a peer Admin', () => {
    expect(
        authority({
            actorRole: 'admin',
            actorUserId: admin,
            targetRole: 'admin',
            targetUserId: peerAdmin,
        })
    ).toEqual({ allowed: false, reason: 'peer-or-higher' });
    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'member' },
            actorRole: 'admin',
            actorUserId: admin,
            targetRole: 'admin',
            targetUserId: peerAdmin,
        })
    ).toEqual({ allowed: false, reason: 'peer-or-higher' });
});

test('only an Owner grants or revokes Owner authority', () => {
    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'owner' },
            actorRole: 'admin',
            actorUserId: admin,
        })
    ).toEqual({ allowed: false, reason: 'requires-owner' });
    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'member' },
            actorRole: 'admin',
            actorUserId: admin,
            targetRole: 'owner',
            targetUserId: secondOwner,
        })
    ).toEqual({ allowed: false, reason: 'requires-owner' });
    expect(
        authority({
            actorRole: 'admin',
            actorUserId: admin,
            targetRole: 'owner',
            targetUserId: secondOwner,
        })
    ).toEqual({ allowed: false, reason: 'requires-owner' });

    expect(authority({ action: { kind: 'changeRole', nextRole: 'owner' } })).toEqual({
        allowed: true,
    });
    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'admin' },
            targetRole: 'owner',
            targetUserId: secondOwner,
        })
    ).toEqual({ allowed: true });
    expect(authority({ targetRole: 'owner', targetUserId: secondOwner })).toEqual({
        allowed: true,
    });
});

test('a Member manages nobody', () => {
    expect(
        authority({
            actorRole: 'member',
            actorUserId: member,
            targetRole: 'member',
            targetUserId: 'usr_other_member',
        })
    ).toEqual({ allowed: false, reason: 'requires-admin' });
    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'admin' },
            actorRole: 'member',
            actorUserId: member,
            targetRole: 'member',
            targetUserId: 'usr_other_member',
        })
    ).toEqual({ allowed: false, reason: 'requires-admin' });
});

test('the last Owner cannot be removed, demoted, or leave', () => {
    const lastOwner = {
        targetIsLastOwner: true,
        targetRole: 'owner',
        targetUserId: owner,
    } as const;

    expect(authority({ ...lastOwner })).toEqual({ allowed: false, reason: 'last-owner' });
    expect(authority({ ...lastOwner, action: { kind: 'changeRole', nextRole: 'admin' } })).toEqual({
        allowed: false,
        reason: 'last-owner',
    });
    expect(authority({ ...lastOwner, action: { kind: 'leave' } })).toEqual({
        allowed: false,
        reason: 'last-owner',
    });
});

test('self-demotion is allowed and self-promotion is refused', () => {
    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'admin' },
            targetRole: 'owner',
            targetUserId: owner,
        })
    ).toEqual({ allowed: true });
    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'member' },
            actorRole: 'admin',
            actorUserId: admin,
            targetRole: 'admin',
            targetUserId: admin,
        })
    ).toEqual({ allowed: true });

    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'admin' },
            actorRole: 'member',
            actorUserId: member,
            targetRole: 'member',
            targetUserId: member,
        })
    ).toEqual({ allowed: false, reason: 'self-promotion' });
    expect(
        authority({
            action: { kind: 'changeRole', nextRole: 'owner' },
            actorRole: 'admin',
            actorUserId: admin,
            targetRole: 'admin',
            targetUserId: admin,
        })
    ).toEqual({ allowed: false, reason: 'self-promotion' });
});

test('any human may leave a Server they are not the last Owner of', () => {
    expect(
        authority({
            action: { kind: 'leave' },
            actorRole: 'member',
            actorUserId: member,
            targetRole: 'member',
            targetUserId: member,
        })
    ).toEqual({ allowed: true });
    expect(
        authority({ action: { kind: 'leave' }, targetRole: 'owner', targetUserId: owner })
    ).toEqual({ allowed: true });
});

test('removal and leaving stay distinct actions', () => {
    expect(authority({ targetRole: 'owner', targetUserId: owner })).toEqual({
        allowed: false,
        reason: 'use-leave',
    });
    expect(
        authority({
            action: { kind: 'leave' },
            targetRole: 'member',
            targetUserId: member,
        })
    ).toEqual({ allowed: false, reason: 'not-self' });
});

test('every privilege elevation asks for the Server address', () => {
    expect(requiresSlugConfirmation({ kind: 'changeRole', nextRole: 'admin' }, 'member')).toBe(
        true
    );
    expect(requiresSlugConfirmation({ kind: 'changeRole', nextRole: 'owner' }, 'member')).toBe(
        true
    );
    expect(requiresSlugConfirmation({ kind: 'changeRole', nextRole: 'owner' }, 'admin')).toBe(true);
});

test('losing access or Owner authority asks for the Server address', () => {
    expect(requiresSlugConfirmation({ kind: 'remove' }, 'member')).toBe(true);
    expect(requiresSlugConfirmation({ kind: 'leave' }, 'owner')).toBe(true);
    expect(requiresSlugConfirmation({ kind: 'changeRole', nextRole: 'admin' }, 'owner')).toBe(true);
    expect(requiresSlugConfirmation({ kind: 'changeRole', nextRole: 'member' }, 'owner')).toBe(
        true
    );
});

test('stepping an Admin down to Member is an ordinary confirmation', () => {
    expect(requiresSlugConfirmation({ kind: 'changeRole', nextRole: 'member' }, 'admin')).toBe(
        false
    );
});

test('a role change to the role already held is refused as a no-op', () => {
    expect(authority({ action: { kind: 'changeRole', nextRole: 'member' } })).toEqual({
        allowed: false,
        reason: 'no-op',
    });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerMemberDirectory } from '@haus/api/membership';
import { memberChangeDescription, serverMemberRowActions } from './server-member-actions.ts';

const ownerId = 'usr_aaaaaaowner1';
const adminId = 'usr_bbbbbbadmin1';
const memberId = 'usr_ccccccmembr1';

function directory(viewerUserId: string, overrides: Partial<ServerMemberDirectory> = {}) {
    const members = overrides.members ?? [
        {
            avatarUrl: null,
            description: null,
            displayName: null,
            email: null,
            handle: null,
            joinedAt: '2026-01-01T00:00:00.000Z',
            role: 'owner' as const,
            timezone: null,
            userId: ownerId,
        },
        {
            avatarUrl: null,
            description: null,
            displayName: null,
            email: null,
            handle: null,
            joinedAt: '2026-01-02T00:00:00.000Z',
            role: 'admin' as const,
            timezone: null,
            userId: adminId,
        },
        {
            avatarUrl: null,
            description: null,
            displayName: null,
            email: null,
            handle: null,
            joinedAt: '2026-01-03T00:00:00.000Z',
            role: 'member' as const,
            timezone: null,
            userId: memberId,
        },
    ];
    const viewer = members.find((entry) => entry.userId === viewerUserId);

    return {
        members,
        viewerRole: viewer?.role ?? 'member',
        viewerUserId,
        ...overrides,
    } satisfies ServerMemberDirectory;
}

function actionKinds(viewerUserId: string, targetUserId: string) {
    const current = directory(viewerUserId);
    const target = current.members.find((entry) => entry.userId === targetUserId);
    assert.ok(target);

    return serverMemberRowActions(current, target).map((action) => action.kind);
}

test('a change description names the human the way every other surface does', () => {
    const current = directory(ownerId);
    const target = current.members.find((entry) => entry.userId === memberId);
    assert.ok(target);
    const [remove] = serverMemberRowActions(current, target).filter(
        (action) => action.kind === 'remove'
    );
    assert.ok(remove);

    // No profile yet: the id tail stands in.
    assert.match(memberChangeDescription(target, remove, 'dev'), /Human membr1/);
    // Once they have a name, the description uses it.
    assert.match(
        memberChangeDescription({ ...target, displayName: 'Ada Lovelace' }, remove, 'dev'),
        /Ada Lovelace/
    );
});

test('an Owner may manage everyone else', () => {
    assert.deepEqual(actionKinds(ownerId, memberId), ['promote-admin', 'grant-owner', 'remove']);
    assert.deepEqual(actionKinds(ownerId, adminId), ['demote-member', 'grant-owner', 'remove']);
});

test('revoking Owner is its own action rather than a mislabelled demotion', () => {
    const current = directory(ownerId, {
        members: [
            {
                avatarUrl: null,
                description: null,
                displayName: null,
                email: null,
                handle: null,
                joinedAt: '2026-01-01T00:00:00.000Z',
                role: 'owner',
                timezone: null,
                userId: ownerId,
            },
            {
                avatarUrl: null,
                description: null,
                displayName: null,
                email: null,
                handle: null,
                joinedAt: '2026-01-02T00:00:00.000Z',
                role: 'owner',
                timezone: null,
                userId: 'usr_ddddddowner2',
            },
        ],
        viewerRole: 'owner',
        viewerUserId: ownerId,
    });
    const target = current.members[1];
    const actions = serverMemberRowActions(current, target);

    assert.deepEqual(
        actions.map((action) => action.kind),
        ['revoke-owner', 'remove']
    );
    assert.equal(actions[0].label, 'Revoke Owner');
    assert.equal(actions[0].nextRole, 'admin');
    assert.equal(actions[0].requiresSlug, true);
});

test('an Admin manages Members but is offered nothing against peers or Owners', () => {
    assert.deepEqual(actionKinds(adminId, memberId), ['promote-admin', 'remove']);
    assert.deepEqual(actionKinds(adminId, ownerId), []);
});

test('a Member is offered no management at all', () => {
    assert.deepEqual(actionKinds(memberId, adminId), []);
    assert.deepEqual(actionKinds(memberId, ownerId), []);
});

test('every human is offered leaving on their own row, and never removal', () => {
    assert.deepEqual(actionKinds(memberId, memberId), ['leave']);
    assert.deepEqual(actionKinds(adminId, adminId), ['demote-member', 'leave']);
});

test('the last Owner sees the protected actions explained rather than hidden', () => {
    const soleOwner = directory(ownerId, {
        members: [
            {
                avatarUrl: null,
                description: null,
                displayName: null,
                email: null,
                handle: null,
                joinedAt: '2026-01-01T00:00:00.000Z',
                role: 'owner',
                timezone: null,
                userId: ownerId,
            },
        ],
        viewerRole: 'owner',
        viewerUserId: ownerId,
    });
    const target = soleOwner.members[0];
    const actions = serverMemberRowActions(soleOwner, target);

    assert.deepEqual(
        actions.map((action) => action.kind),
        ['revoke-owner', 'leave']
    );
    assert.ok(actions.every((action) => action.disabledReason !== null));
    assert.match(actions[1].disabledReason ?? '', /last Owner/i);
});

test('every elevation and every departure asks for the Server address', () => {
    const current = directory(ownerId);
    const member = current.members.find((entry) => entry.userId === memberId);
    const admin = current.members.find((entry) => entry.userId === adminId);
    assert.ok(member);
    assert.ok(admin);

    const onMember = new Map(
        serverMemberRowActions(current, member).map((action) => [action.kind, action])
    );
    const onAdmin = new Map(
        serverMemberRowActions(current, admin).map((action) => [action.kind, action])
    );

    assert.equal(onMember.get('promote-admin')?.requiresSlug, true);
    assert.equal(onMember.get('grant-owner')?.requiresSlug, true);
    assert.equal(onMember.get('remove')?.requiresSlug, true);
    assert.equal(onAdmin.get('grant-owner')?.requiresSlug, true);

    // Stepping an Admin down grants nothing and costs no access.
    assert.equal(onAdmin.get('demote-member')?.requiresSlug, false);
});

test('a confirmation names the human and the role at stake', () => {
    const current = directory(ownerId);
    const member = current.members.find((entry) => entry.userId === memberId);
    assert.ok(member);

    const byKind = new Map(
        serverMemberRowActions(current, member).map((action) => [action.kind, action])
    );
    const promote = byKind.get('promote-admin');
    const remove = byKind.get('remove');
    assert.ok(promote);
    assert.ok(remove);

    const promotion = memberChangeDescription(member, promote, 'haus-hq');
    assert.match(promotion, /Human membr1/u);
    assert.match(promotion, /member/u);
    assert.match(promotion, /admin/u);

    const removal = memberChangeDescription(member, remove, 'haus-hq');
    assert.match(removal, /Human membr1/u);
    assert.match(removal, /member/u);
    assert.match(removal, /haus-hq/u);
});

test('leaving names your own role so the cost is explicit', () => {
    const current = directory(adminId);
    const self = current.members.find((entry) => entry.userId === adminId);
    assert.ok(self);

    const leave = serverMemberRowActions(current, self).find((action) => action.kind === 'leave');
    assert.ok(leave);

    const description = memberChangeDescription(self, leave, 'haus-hq');
    assert.match(description, /Human admin1/u);
    assert.match(description, /admin/u);
});

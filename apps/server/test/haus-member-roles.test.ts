import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * Owner, Admin, and Member authority on one Server. An Admin manages Members
 * but never a peer Admin or an Owner; only an Owner grants or revokes Owner;
 * the Server always keeps one Owner.
 */
let harness: HausServerHarness;
let owner: HausClient;
let admin: HausClient;
let plainMember: HausClient;
let outsider: HausClient;
let serverId: string;
let outsiderServerId: string;
const slug = 'roles-hq';

let ownerUserId: string;
let adminUserId: string;
let memberUserId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_role_owner', ['role-owner@haus.test']);
    admin = await signIn('user_role_admin', ['role-admin@haus.test']);
    plainMember = await signIn('user_role_member', ['role-member@haus.test']);
    outsider = await signIn('user_role_outsider', ['role-outsider@haus.test']);

    const created = await owner.trpc.server.create.mutate({ displayName: 'Roles HQ', slug });
    serverId = created.id;

    const outsiderServer = await outsider.trpc.server.create.mutate({
        displayName: 'Roles Outsider',
        slug: 'roles-outsider',
    });
    outsiderServerId = outsiderServer.id;

    await join(admin, 'role-admin@haus.test');
    await join(plainMember, 'role-member@haus.test');

    ownerUserId = await readUserId('user_role_owner');
    adminUserId = await readUserId('user_role_admin');
    memberUserId = await readUserId('user_role_member');

    await owner.trpc.member.changeRole.mutate({
        confirmation: slug,
        role: 'admin',
        serverId,
        userId: adminUserId,
    });
});

afterAll(async () => {
    await harness.close();
});

test('the member directory names every human, their role, and the viewer', async () => {
    const directory = await plainMember.trpc.member.list.query({ serverId });

    expect(directory.viewerUserId).toBe(memberUserId);
    expect(directory.viewerRole).toBe('member');
    expect(
        directory.members
            .map((entry) => ({ role: entry.role, userId: entry.userId }))
            .sort((a, b) => a.userId.localeCompare(b.userId))
    ).toEqual(
        [
            { role: 'owner', userId: ownerUserId },
            { role: 'admin', userId: adminUserId },
            { role: 'member', userId: memberUserId },
        ].sort((a, b) => a.userId.localeCompare(b.userId))
    );
    expect(directory.members.every((entry) => typeof entry.joinedAt === 'string')).toBe(true);

    await expect(outsider.trpc.member.list.query({ serverId })).rejects.toThrow(/not a member/i);
});

test('a member reads one current human without loading the directory', async () => {
    await expect(
        plainMember.trpc.member.get.query({ serverId, userId: ownerUserId })
    ).resolves.toMatchObject({ role: 'owner', userId: ownerUserId });

    await expect(
        plainMember.trpc.member.get.query({ serverId, userId: 'usr_missing' })
    ).rejects.toThrow(/not a current member/i);

    await expect(outsider.trpc.member.get.query({ serverId, userId: ownerUserId })).rejects.toThrow(
        /not a member/i
    );
});

test('an Admin promotes a Member but cannot touch a peer Admin', async () => {
    const promoted = await signIn('user_role_promoted', ['role-promoted@haus.test']);
    await join(promoted, 'role-promoted@haus.test');
    const promotedUserId = await readUserId('user_role_promoted');

    // Elevating a Member to Admin grants authority, so it takes the address.
    await expect(
        admin.trpc.member.changeRole.mutate({
            role: 'admin',
            serverId,
            userId: promotedUserId,
        })
    ).rejects.toThrow(/address/i);

    await expect(
        admin.trpc.member.changeRole.mutate({
            confirmation: slug,
            role: 'admin',
            serverId,
            userId: promotedUserId,
        })
    ).resolves.toMatchObject({ role: 'admin', userId: promotedUserId });

    await expect(
        admin.trpc.member.changeRole.mutate({
            confirmation: slug,
            role: 'member',
            serverId,
            userId: promotedUserId,
        })
    ).rejects.toThrow(/peer/i);
});

test('only an Owner grants or revokes Owner authority', async () => {
    await expect(
        admin.trpc.member.changeRole.mutate({
            confirmation: slug,
            role: 'owner',
            serverId,
            userId: memberUserId,
        })
    ).rejects.toThrow(/Owner/i);

    await expect(
        admin.trpc.member.changeRole.mutate({
            confirmation: slug,
            role: 'member',
            serverId,
            userId: ownerUserId,
        })
    ).rejects.toThrow(/Owner/i);

    const second = await owner.trpc.member.changeRole.mutate({
        confirmation: slug,
        role: 'owner',
        serverId,
        userId: memberUserId,
    });
    expect(second.role).toBe('owner');

    // Multiple Owners are allowed, so the original may now step down.
    await expect(
        owner.trpc.member.changeRole.mutate({
            confirmation: slug,
            role: 'admin',
            serverId,
            userId: ownerUserId,
        })
    ).resolves.toMatchObject({ role: 'admin' });

    // Restore the original Owner through the new one for later cases.
    await plainMember.trpc.member.changeRole.mutate({
        confirmation: slug,
        role: 'owner',
        serverId,
        userId: ownerUserId,
    });
    await plainMember.trpc.member.changeRole.mutate({
        confirmation: slug,
        role: 'member',
        serverId,
        userId: memberUserId,
    });
});

test('every elevation requires the exact Server address', async () => {
    for (const role of ['admin', 'owner'] as const) {
        await expect(
            owner.trpc.member.changeRole.mutate({ role, serverId, userId: memberUserId })
        ).rejects.toThrow(/address/i);
        await expect(
            owner.trpc.member.changeRole.mutate({
                confirmation: 'wrong-slug',
                role,
                serverId,
                userId: memberUserId,
            })
        ).rejects.toThrow(/address/i);
    }

    // They are still a Member: no elevation slipped through.
    const directory = await owner.trpc.member.list.query({ serverId });
    expect(directory.members.find((entry) => entry.userId === memberUserId)?.role).toBe('member');

    await expect(
        owner.trpc.member.changeRole.mutate({
            confirmation: slug,
            role: 'admin',
            serverId,
            userId: memberUserId,
        })
    ).resolves.toMatchObject({ role: 'admin' });

    // Stepping back down to Member is the one ordinary confirmation.
    await expect(
        owner.trpc.member.changeRole.mutate({ role: 'member', serverId, userId: memberUserId })
    ).resolves.toMatchObject({ role: 'member' });
});

test('a Member manages nobody and nobody promotes themselves', async () => {
    await expect(
        plainMember.trpc.member.changeRole.mutate({
            role: 'admin',
            serverId,
            userId: adminUserId,
        })
    ).rejects.toThrow(/Owner or Admin|peer/i);

    await expect(
        plainMember.trpc.member.changeRole.mutate({
            role: 'admin',
            serverId,
            userId: memberUserId,
        })
    ).rejects.toThrow(/yourself|self/i);

    // Stepping down is always available.
    await expect(
        admin.trpc.member.changeRole.mutate({ role: 'member', serverId, userId: adminUserId })
    ).resolves.toMatchObject({ role: 'member' });
    await owner.trpc.member.changeRole.mutate({
        confirmation: slug,
        role: 'admin',
        serverId,
        userId: adminUserId,
    });
});

test('the last Owner cannot be demoted, by anyone or by themselves', async () => {
    await expect(
        owner.trpc.member.changeRole.mutate({
            confirmation: slug,
            role: 'admin',
            serverId,
            userId: ownerUserId,
        })
    ).rejects.toThrow(/last Owner/i);

    await expect(owner.trpc.server.bySlug.query({ slug })).resolves.toMatchObject({
        role: 'owner',
    });
});

test('role changes fail closed across Servers', async () => {
    await expect(
        owner.trpc.member.changeRole.mutate({
            role: 'admin',
            serverId: outsiderServerId,
            userId: memberUserId,
        })
    ).rejects.toThrow(/not a member/i);
    await expect(
        outsider.trpc.member.changeRole.mutate({ role: 'admin', serverId, userId: memberUserId })
    ).rejects.toThrow(/not a member/i);
});

async function join(client: HausClient, email: string) {
    const { token } = await owner.trpc.invitation.create.mutate({ email, serverId });
    await client.trpc.invitation.accept.mutate({ token });
}

async function readUserId(subject: string) {
    const [row] = await harness.sql`
        select id from users where auth_subject = ${subject}
    `;

    return row.id as string;
}

async function signIn(subject: string, verifiedEmails: string[]) {
    harness.humans.setVerifiedEmails(subject, verifiedEmails);

    const token = await harness.humans.mintSessionToken(subject);

    return createHausClient(harness, token);
}

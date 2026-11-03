import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * Two Owners racing to unseat each other is the case a per-request check gets
 * wrong: each reads two Owners, each decides the other is removable, and the
 * Server ends up with none. Every membership change serializes on the Server
 * row, so exactly one of these commits.
 */
let harness: HausServerHarness;
let servers = 0;

beforeAll(async () => {
    harness = await startHausServerHarness();
});

afterAll(async () => {
    await harness.close();
});

interface CoOwnedServer {
    first: HausClient;
    firstUserId: string;
    second: HausClient;
    secondUserId: string;
    serverId: string;
    slug: string;
}

test('two Owners cannot concurrently remove each other', async () => {
    const server = await coOwnedServer();

    const attempts = await Promise.allSettled([
        server.first.trpc.member.remove.mutate({
            confirmation: server.slug,
            serverId: server.serverId,
            userId: server.secondUserId,
        }),
        server.second.trpc.member.remove.mutate({
            confirmation: server.slug,
            serverId: server.serverId,
            userId: server.firstUserId,
        }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    await expect(countOwners(server.serverId)).resolves.toBe(1);
});

test('two Owners cannot concurrently demote each other', async () => {
    const server = await coOwnedServer();

    const attempts = await Promise.allSettled([
        server.first.trpc.member.changeRole.mutate({
            confirmation: server.slug,
            role: 'admin',
            serverId: server.serverId,
            userId: server.secondUserId,
        }),
        server.second.trpc.member.changeRole.mutate({
            confirmation: server.slug,
            role: 'admin',
            serverId: server.serverId,
            userId: server.firstUserId,
        }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    await expect(countOwners(server.serverId)).resolves.toBe(1);
});

test('two Owners cannot concurrently leave', async () => {
    const server = await coOwnedServer();

    const attempts = await Promise.allSettled([
        server.first.trpc.member.leave.mutate({
            confirmation: server.slug,
            serverId: server.serverId,
        }),
        server.second.trpc.member.leave.mutate({
            confirmation: server.slug,
            serverId: server.serverId,
        }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    await expect(countOwners(server.serverId)).resolves.toBe(1);
});

test('one Owner leaving races a demotion of the other without emptying the Server', async () => {
    const server = await coOwnedServer();

    const attempts = await Promise.allSettled([
        server.first.trpc.member.leave.mutate({
            confirmation: server.slug,
            serverId: server.serverId,
        }),
        server.second.trpc.member.changeRole.mutate({
            confirmation: server.slug,
            role: 'member',
            serverId: server.serverId,
            userId: server.firstUserId,
        }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled').length).toBeGreaterThan(0);
    expect(await countOwners(server.serverId)).toBeGreaterThanOrEqual(1);
});

test('many concurrent attempts on a sole Owner all fail', async () => {
    const server = await coOwnedServer();

    await server.first.trpc.member.remove.mutate({
        confirmation: server.slug,
        serverId: server.serverId,
        userId: server.secondUserId,
    });

    const attempts = await Promise.allSettled([
        server.first.trpc.member.leave.mutate({
            confirmation: server.slug,
            serverId: server.serverId,
        }),
        server.first.trpc.member.changeRole.mutate({
            confirmation: server.slug,
            role: 'admin',
            serverId: server.serverId,
            userId: server.firstUserId,
        }),
        server.first.trpc.member.changeRole.mutate({
            confirmation: server.slug,
            role: 'member',
            serverId: server.serverId,
            userId: server.firstUserId,
        }),
    ]);

    expect(attempts.every((attempt) => attempt.status === 'rejected')).toBe(true);
    await expect(countOwners(server.serverId)).resolves.toBe(1);
});

async function countOwners(serverId: string) {
    const [row] = await harness.sql`
        select count(*)::int as total from server_memberships
        where server_id = ${serverId} and role = 'owner' and revoked_at is null
    `;

    return row.total as number;
}

async function coOwnedServer(): Promise<CoOwnedServer> {
    servers += 1;
    const slug = `last-owner-${servers}`;
    const firstSubject = `subject_last_owner_${servers}_a`;
    const secondSubject = `subject_last_owner_${servers}_b`;
    const secondEmail = `${secondSubject}@haus.test`;

    const first = await signIn(firstSubject, [`${firstSubject}@haus.test`]);
    const second = await signIn(secondSubject, [secondEmail]);

    const created = await first.trpc.server.create.mutate({ displayName: slug, slug });
    const { token } = await first.trpc.invitation.create.mutate({
        email: secondEmail,
        serverId: created.id,
    });
    await second.trpc.invitation.accept.mutate({ token });

    const firstUserId = await readUserId(firstSubject);
    const secondUserId = await readUserId(secondSubject);

    await first.trpc.member.changeRole.mutate({
        confirmation: slug,
        role: 'owner',
        serverId: created.id,
        userId: secondUserId,
    });

    return { first, firstUserId, second, secondUserId, serverId: created.id, slug };
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

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let allChatId: string;
const slug = 'membership-serialize-hq';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_membership_serialize_owner', [
        'membership-serialize-owner@haus.test',
    ]);
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Membership Serialize HQ',
        slug,
    });
    serverId = server.id;
    allChatId = server.channels[0].id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('invitation creation queued behind removal reauthorizes before it writes', async () => {
    const admin = await addAdmin('inviter');
    const email = 'serialize-after-removal@haus.test';
    let removal: Promise<unknown> = Promise.resolve();
    let creation: Promise<unknown> = Promise.resolve();

    await whileServerRowIsHeld(async () => {
        removal = remove(admin.userId);
        await Bun.sleep(120);
        creation = admin.client.trpc.invitation.create.mutate({ email, serverId });
        await Bun.sleep(120);
    });

    await expect(removal).resolves.toMatchObject({ userId: admin.userId });
    await expect(creation).rejects.toThrow(/not a member/i);
    const [stored] = await harness.sql`
        select count(*)::int as total from server_invitations
        where server_id = ${serverId} and email = ${email}
    `;
    expect(stored.total).toBe(0);
    admin.client.close();
});

test('DM creation queued behind removal reauthorizes before it writes', async () => {
    const caller = await addMember('dm');
    const ownerUserId = await readUserId('user_membership_serialize_owner');
    let removal: Promise<unknown> = Promise.resolve();
    let ensureDm: Promise<unknown> = Promise.resolve();

    await whileServerRowIsHeld(async () => {
        removal = remove(caller.userId);
        await Bun.sleep(120);
        ensureDm = caller.client.trpc.chat.ensureDm.mutate({
            peerUserId: ownerUserId,
            serverId,
        });
        await Bun.sleep(120);
    });

    await expect(removal).resolves.toMatchObject({ userId: caller.userId });
    await expect(ensureDm).rejects.toThrow(/not a member/i);
    const [stored] = await harness.sql`
        select count(*)::int as total from chats
        where server_id = ${serverId}
            and kind = 'dm'
            and (
                dm_member_one_user_id = ${caller.userId}
                or dm_member_two_user_id = ${caller.userId}
            )
    `;
    expect(stored.total).toBe(0);
    caller.client.close();
});

test('invitation revocation queued behind removal reauthorizes before it writes', async () => {
    const admin = await addAdmin('revoker');
    const created = await admin.client.trpc.invitation.create.mutate({
        email: 'serialize-still-live@haus.test',
        serverId,
    });
    let removal: Promise<unknown> = Promise.resolve();
    let revocation: Promise<unknown> = Promise.resolve();

    await whileServerRowIsHeld(async () => {
        removal = remove(admin.userId);
        await Bun.sleep(120);
        revocation = admin.client.trpc.invitation.revoke.mutate({
            invitationId: created.invitation.id,
            serverId,
        });
        await Bun.sleep(120);
    });

    await expect(removal).resolves.toMatchObject({ userId: admin.userId });
    await expect(revocation).rejects.toThrow(/not a member/i);
    const [stored] = await harness.sql`
        select revoked_at from server_invitations
        where server_id = ${serverId} and id = ${created.invitation.id}
    `;
    expect(stored.revoked_at).toBeNull();
    admin.client.close();
});

test('invitation revocation and acceptance keep the Server-first lock order', async () => {
    const candidate = await signIn('user_membership_serialize_candidate', [
        'membership-serialize-candidate@haus.test',
    ]);
    const created = await owner.trpc.invitation.create.mutate({
        email: 'membership-serialize-candidate@haus.test',
        serverId,
    });
    let revocation: Promise<unknown> = Promise.resolve();
    let acceptance: Promise<unknown> = Promise.resolve();

    await whileServerRowIsHeld(async () => {
        revocation = owner.trpc.invitation.revoke.mutate({
            invitationId: created.invitation.id,
            serverId,
        });
        await Bun.sleep(120);
        acceptance = candidate.trpc.invitation.accept.mutate({ token: created.token });
        await Bun.sleep(120);
    });

    await expect(revocation).resolves.toMatchObject({ status: 'revoked' });
    await expect(acceptance).rejects.toThrow(/no longer available/i);
    candidate.close();
});

test('Thread follow queued behind removal reauthorizes before it writes', async () => {
    const member = await addMember('follow');
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: allChatId,
        content: 'Follow serialization anchor',
        nonce: 'follow-serialization-anchor',
        serverId,
    });
    const reply = await member.client.trpc.chat.send.mutate({
        chatId: allChatId,
        content: 'Follow before removal',
        nonce: 'follow-serialization-reply',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    const threadChatId = reply.threadChatId as string;
    let removal: Promise<unknown> = Promise.resolve();
    let follow: Promise<unknown> = Promise.resolve();

    await whileServerRowIsHeld(async () => {
        removal = remove(member.userId);
        await Bun.sleep(120);
        follow = member.client.trpc.thread.setFollow.mutate({
            follow: false,
            serverId,
            threadChatId,
        });
        await Bun.sleep(120);
    });

    const [removalResult, followResult] = await Promise.allSettled([removal, follow]);
    expect(removalResult).toMatchObject({ status: 'fulfilled' });
    expect(followResult).toMatchObject({ status: 'rejected' });
    if (followResult.status === 'rejected') {
        expect(followResult.reason).toHaveProperty(
            'message',
            expect.stringMatching(/not a member/i)
        );
    }
    const [stored] = await harness.sql`
        select count(*)::int as total from thread_follows
        where server_id = ${serverId} and user_id = ${member.userId}
    `;
    expect(stored.total).toBe(0);

    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'membership-serialize-follow@haus.test',
        serverId,
    });
    await member.client.trpc.invitation.accept.mutate({ token });
    const parent = await member.client.trpc.chat.messages.query({ chatId: allChatId, serverId });
    expect(parent.threads).toMatchObject([{ followed: false, threadChatId }]);
    member.client.close();
});

test('task update queued behind removal reauthorizes before it writes', async () => {
    const member = await addMember('task-update');
    const created = await owner.trpc.task.create.mutate({
        chatId: allChatId,
        content: 'Claim only while membership is current',
        nonce: 'task-claim-membership-serialization',
        serverId,
    });
    let removal: Promise<unknown> = Promise.resolve();
    let claim: Promise<unknown> = Promise.resolve();

    await whileServerRowIsHeld(async () => {
        removal = remove(member.userId);
        await Bun.sleep(120);
        claim = member.client.trpc.task.update.mutate({
            expectedVersion: created.task.version,
            messageId: created.task.messageId,
            patch: { priority: 'high' },
            serverId,
        });
        await Bun.sleep(120);
    });

    const [removalResult, claimResult] = await Promise.allSettled([removal, claim]);
    expect(removalResult).toMatchObject({ status: 'fulfilled' });
    expect(claimResult).toMatchObject({ status: 'rejected' });
    if (claimResult.status === 'rejected') {
        expect(claimResult.reason).toHaveProperty(
            'message',
            expect.stringMatching(/not a member/i)
        );
    }
    const listed = (await owner.trpc.task.list.query({ serverId })).tasks.find(
        (candidate) => candidate.task.messageId === created.task.messageId
    );
    expect(listed?.task).toMatchObject({
        priority: 'none',
        version: created.task.version,
    });
    member.client.close();
});

async function addAdmin(label: string) {
    const member = await addMember(label);
    await owner.trpc.member.changeRole.mutate({
        confirmation: slug,
        role: 'admin',
        serverId,
        userId: member.userId,
    });
    return member;
}

async function addMember(label: string) {
    const clerkUserId = `user_membership_serialize_${label}`;
    const email = `membership-serialize-${label}@haus.test`;
    const client = await signIn(clerkUserId, [email]);
    const { token } = await owner.trpc.invitation.create.mutate({ email, serverId });
    await client.trpc.invitation.accept.mutate({ token });
    return { client, userId: await readUserId(clerkUserId) };
}

function remove(userId: string) {
    return owner.trpc.member.remove.mutate({ confirmation: slug, serverId, userId });
}

async function whileServerRowIsHeld(run: () => Promise<void>) {
    const holding = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = harness.sql.begin(async (tx: typeof harness.sql) => {
        await tx`select id from servers where id = ${serverId} for update`;
        holding.resolve();
        await release.promise;
    });
    await holding.promise;
    try {
        await run();
    } finally {
        release.resolve();
        await held;
    }
}

async function readUserId(clerkUserId: string) {
    const [row] = await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `;
    return row.id as string;
}

async function signIn(clerkUserId: string, verifiedEmails: string[]) {
    harness.clerkUsers.setVerifiedEmails(clerkUserId, verifiedEmails);
    const token = await harness.clerk.mintSessionToken(clerkUserId);
    return createHausClient(harness, token);
}

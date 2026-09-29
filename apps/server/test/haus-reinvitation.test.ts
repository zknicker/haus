import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * A returning human comes back as a fresh Member joined to exactly `#all`. The
 * membership row is reused because authored history points at it, so the reset
 * has to prove it carries nothing forward: no old role, no private Channel, no
 * read markers.
 */
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let allChatId: string;
let privateChatId: string;
const slug = 'return-hq';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_return_owner', ['return-owner@haus.test']);

    const created = await owner.trpc.server.create.mutate({ displayName: 'Return HQ', slug });
    serverId = created.id;
    allChatId = created.channels[0].id;

    // A private Channel is Server-owned state a later slice manages; seeding one
    // here is the only way to prove a returning human does not regain it.
    privateChatId = 'cht_return_private';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${privateChatId}, ${serverId}, 'channel', 'leadership')
    `;
});

afterAll(async () => {
    await harness.close();
});

test('a re-invited human returns as a Member joined only to #all', async () => {
    const returner = await signIn('user_return_member', ['returner@haus.test']);
    await join(returner, 'returner@haus.test');
    const returnerUserId = await readUserId('user_return_member');

    // Build up standing worth losing: Admin, a private Channel, and read state.
    await owner.trpc.member.changeRole.mutate({
        confirmation: slug,
        role: 'admin',
        serverId,
        userId: returnerUserId,
    });
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${privateChatId}, ${returnerUserId})
    `;
    await returner.trpc.chat.send.mutate({
        chatId: allChatId,
        content: 'From my first stint',
        nonce: 'return-1',
        serverId,
    });
    await returner.trpc.chat.markRead.mutate({ chatId: allChatId, sequence: 1, serverId });

    const [firstStint] = await harness.sql`
        select joined_at from server_memberships
        where server_id = ${serverId} and user_id = ${returnerUserId}
    `;

    await owner.trpc.member.remove.mutate({
        confirmation: slug,
        serverId,
        userId: returnerUserId,
    });
    await join(returner, 'returner@haus.test');

    const opened = await owner.trpc.member.list.query({ serverId });
    expect(opened.members.find((entry) => entry.userId === returnerUserId)?.role).toBe('member');

    const chats = await returner.trpc.chat.list.query({ serverId });
    expect(chats.map((chat) => chat.id)).toEqual([allChatId]);
    await expect(
        returner.trpc.chat.messages.query({ chatId: privateChatId, serverId })
    ).rejects.toThrow(/participant/i);

    // The stint is new, and the reused row still anchors what they authored.
    const [secondStint] = await harness.sql`
        select joined_at, revoked_at from server_memberships
        where server_id = ${serverId} and user_id = ${returnerUserId}
    `;
    expect(secondStint.revoked_at).toBeNull();
    expect(new Date(secondStint.joined_at).getTime()).toBeGreaterThan(
        new Date(firstStint.joined_at).getTime()
    );

    const messages = await returner.trpc.chat.messages.query({ chatId: allChatId, serverId });
    expect(messages.messages.at(0)).toMatchObject({
        author: { kind: 'human', userId: returnerUserId },
        content: 'From my first stint',
    });

    // Read markers did not survive, so their first message reads as unread.
    expect(chats[0].unreadCount).toBe(0);
});

test('exactly one membership row is ever kept for a returning human', async () => {
    const returnerUserId = await readUserId('user_return_member');
    const [rows] = await harness.sql`
        select count(*)::int as total from server_memberships
        where server_id = ${serverId} and user_id = ${returnerUserId}
    `;

    expect(rows.total).toBe(1);
});

test('a returning human cannot reopen DM history from their former membership stint', async () => {
    const returner = await signIn('user_return_dm', ['return-dm@haus.test']);
    await join(returner, 'return-dm@haus.test');
    const ownerUserId = await readUserId('user_return_owner');
    const returnerUserId = await readUserId('user_return_dm');
    const formerDm = await returner.trpc.chat.ensureDm.mutate({
        peerUserId: ownerUserId,
        serverId,
    });
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: formerDm.id,
        content: 'Private history from the former stint',
        nonce: 'return-dm-anchor',
        serverId,
    });
    const reply = await returner.trpc.chat.send.mutate({
        chatId: formerDm.id,
        content: 'Former-stint Thread reply',
        nonce: 'return-dm-thread',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });

    await owner.trpc.member.remove.mutate({
        confirmation: slug,
        serverId,
        userId: returnerUserId,
    });

    // Removal preserves the collaboration history for the peer who still owns
    // access to it.
    await expect(
        owner.trpc.chat.messages.query({ chatId: formerDm.id, serverId })
    ).resolves.toMatchObject({
        messages: [{ content: 'Private history from the former stint' }],
    });
    await expect(
        owner.trpc.chat.messages.query({ chatId: reply.threadChatId as string, serverId })
    ).resolves.toMatchObject({
        messages: [{ content: 'Former-stint Thread reply' }],
    });

    await join(returner, 'return-dm@haus.test');

    const visibleAfterReturn = await returner.trpc.chat.list.query({ serverId });
    expect(visibleAfterReturn.map((chat) => chat.id)).not.toContain(formerDm.id);
    await expect(
        returner.trpc.chat.messages.query({ chatId: formerDm.id, serverId })
    ).rejects.toThrow(/participant/i);
    await expect(
        returner.trpc.chat.messages.query({
            chatId: reply.threadChatId as string,
            serverId,
        })
    ).rejects.toThrow(/participant/i);

    const freshDm = await returner.trpc.chat.ensureDm.mutate({
        peerUserId: ownerUserId,
        serverId,
    });
    expect(freshDm.id).not.toBe(formerDm.id);
    await expect(
        returner.trpc.chat.messages.query({ chatId: freshDm.id, serverId })
    ).resolves.toMatchObject({ messages: [] });

    const preserved = await harness.sql`
        select id from chats
        where server_id = ${serverId}
            and id in (${formerDm.id}, ${reply.threadChatId as string})
        order by id
    `;
    expect(preserved).toHaveLength(2);
});

test('reinvitation restores no task authority from a former stint', async () => {
    const returner = await signIn('user_return_tasks', ['return-tasks@haus.test']);
    await join(returner, 'return-tasks@haus.test');
    const ownerUserId = await readUserId('user_return_owner');
    const returnerUserId = await readUserId('user_return_tasks');
    const shared = await owner.trpc.task.create.mutate({
        chatId: allChatId,
        content: 'Shared task from the former stint',
        nonce: 'return-task-shared',
        serverId,
    });
    const formerDm = await returner.trpc.chat.ensureDm.mutate({
        peerUserId: ownerUserId,
        serverId,
    });
    const privateTask = await owner.trpc.task.create.mutate({
        chatId: formerDm.id,
        content: 'Private task from the former stint',
        nonce: 'return-task-private',
        serverId,
    });

    await owner.trpc.member.remove.mutate({
        confirmation: slug,
        serverId,
        userId: returnerUserId,
    });

    await expect(returner.trpc.task.list.query({ serverId })).rejects.toThrow(/not a member/i);
    await expect(
        returner.trpc.task.create.mutate({
            chatId: allChatId,
            content: 'Forbidden after removal',
            nonce: 'return-task-forbidden-create',
            serverId,
        })
    ).rejects.toThrow(/not a member/i);
    await expect(
        returner.trpc.task.promote.mutate({
            messageId: shared.task.messageId,
            serverId,
        })
    ).rejects.toThrow(/not a member/i);
    await expect(
        returner.trpc.task.update.mutate({
            expectedVersion: shared.task.version,
            messageId: shared.task.messageId,
            patch: { priority: 'urgent' },
            serverId,
        })
    ).rejects.toThrow(/not a member/i);

    await join(returner, 'return-tasks@haus.test');

    const { tasks: returnedTasks } = await returner.trpc.task.list.query({ serverId });
    expect(returnedTasks.map((item) => item.task.messageId)).toContain(shared.task.messageId);
    expect(returnedTasks.map((item) => item.task.messageId)).not.toContain(
        privateTask.task.messageId
    );
    await expect(
        returner.trpc.chat.messages.query({
            chatId: privateTask.task.threadChatId,
            serverId,
        })
    ).rejects.toThrow(/participant/i);
});

test('a revoked Server subscription stops delivering to a removed human', async () => {
    const watcher = await signIn('user_return_watcher', ['watcher@haus.test']);
    await join(watcher, 'watcher@haus.test');
    const watcherUserId = await readUserId('user_return_watcher');

    const failures: unknown[] = [];
    const subscription = watcher.trpc.server.onUpdate.subscribe(
        { serverId },
        { onError: (error) => failures.push(error) }
    );

    await Bun.sleep(150);
    await owner.trpc.member.remove.mutate({
        confirmation: slug,
        serverId,
        userId: watcherUserId,
    });

    await Bun.sleep(400);
    // Removal emits a Server update; the removed human's subscription must be
    // refused at delivery rather than kept alive on the socket it opened.
    expect(failures.length).toBeGreaterThan(0);

    subscription.unsubscribe();
    watcher.close();
});

async function join(client: HausClient, email: string) {
    const { token } = await owner.trpc.invitation.create.mutate({ email, serverId });
    await client.trpc.invitation.accept.mutate({ token });
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

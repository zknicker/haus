import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';
import { collectStream } from './realtime-stream.ts';

// Focused realtime topics end to end (specs/realtime-events.md): each mutation
// publishes exactly its topic, each stream applies its own audience, and the
// two refusal classes end streams with their codes.
let harness: HausServerHarness;
let owner: HausClient;
let peer: HausClient;
let peerUserId: string;
let serverId: string;
let chatId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_topics_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Topics',
        slug: 'topics',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    peer = await signIn('user_topics_peer');
    peerUserId = await joinAsMember(peer, 'user_topics_peer', serverId, 'topics-peer');
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${chatId}, ${peerUserId})
    `;
});

afterAll(async () => {
    owner.close();
    peer.close();
    await harness.close();
});

test('each mutation publishes exactly its own topic', async () => {
    const realtime = captureAllTopics();
    const topicsOf = async (run: () => Promise<unknown>) => {
        realtime.clear();
        await run();
        await publishedSince(realtime);
        return realtime.topics();
    };

    let sent: Awaited<ReturnType<typeof send>> | undefined;
    expect(
        await topicsOf(async () => {
            sent = await send('topic matrix', 'topics-matrix');
        })
    ).toEqual(['message.created']);
    const messageId = sent?.message.id ?? '';
    expect(
        await topicsOf(() => owner.trpc.chat.react.mutate({ emoji: '👍', messageId, serverId }))
    ).toEqual(['message.reaction.updated']);
    expect(
        await topicsOf(() => peer.trpc.chat.markRead.mutate({ chatId, sequence: 999, serverId }))
    ).toEqual(['chat.read']);
    let repeatedRead: { advanced: boolean } | undefined;
    expect(
        await topicsOf(async () => {
            repeatedRead = await peer.trpc.chat.markRead.mutate({
                chatId,
                sequence: 999,
                serverId,
            });
        })
    ).toEqual([]);
    expect(repeatedRead?.advanced).toBe(false);
    expect(await topicsOf(() => owner.trpc.task.promote.mutate({ messageId, serverId }))).toEqual([
        'task.changed',
    ]);
    expect(
        await topicsOf(() => owner.trpc.taskLabel.create.mutate({ name: 'Ops', serverId }))
    ).toEqual(['taskLabel.updated']);
    expect(
        await topicsOf(() =>
            owner.trpc.server.rename.mutate({ displayName: 'Topics HQ', serverId })
        )
    ).toEqual(['server.updated']);
    expect(
        await topicsOf(() =>
            owner.trpc.invitation.create.mutate({ email: 'topics@haus.test', serverId })
        )
    ).toEqual(['invitation.updated']);
    expect(
        await topicsOf(() =>
            owner.trpc.member.changeRole.mutate({
                confirmation: 'topics',
                role: 'admin',
                serverId,
                userId: peerUserId,
            })
        )
    ).toEqual(['member.updated']);
    expect(realtime.published()).toEqual([
        {
            audienceUserId: null,
            event: { memberId: peerUserId, serverId },
            topic: 'member.updated',
        },
    ]);
    await owner.trpc.member.changeRole.mutate({
        confirmation: 'topics',
        role: 'member',
        serverId,
        userId: peerUserId,
    });

    // A write that fails rolls back and announces nothing.
    expect(
        await topicsOf(() =>
            send('never committed', 'topics-rollback', 'msg_doesnotexist0000').catch(
                () => undefined
            )
        )
    ).toEqual([]);
    realtime.stop();
});

test('reader-only events reach their reader and no other member', async () => {
    const ownerReads = collectStream(owner.trpc.chat.onRead, { serverId });
    const peerReads = collectStream(peer.trpc.chat.onRead, { serverId });
    await Promise.all([ownerReads.started, peerReads.started]);
    const latest = await send('read me', 'topics-read-me');

    await owner.trpc.chat.markRead.mutate({ chatId, sequence: latest.message.sequence, serverId });
    await peer.trpc.chat.markRead.mutate({ chatId, sequence: latest.message.sequence, serverId });

    await expect(ownerReads.next()).resolves.toEqual({
        chatId,
        parentChatId: null,
        sequence: latest.message.sequence,
        serverId,
        threadAnchorMessageId: null,
    });
    // The peer's first read event is its own: the owner's never reached it.
    await expect(peerReads.next()).resolves.toMatchObject({ sequence: latest.message.sequence });
    expect(peerReads.events).toHaveLength(1);
    ownerReads.stop();
    peerReads.stop();
});

test('a Thread read names its parent anchor', async () => {
    const anchor = await send('read anchor', 'topics-read-anchor');
    const reply = await peer.trpc.chat.send.mutate({
        chatId,
        content: 'read reply',
        nonce: 'topics-read-reply',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    const reads = collectStream(owner.trpc.chat.onRead, { serverId });
    await reads.started;

    await owner.trpc.chat.markRead.mutate({
        chatId: reply.threadChatId ?? '',
        sequence: reply.message.sequence,
        serverId,
    });

    await expect(reads.next()).resolves.toEqual({
        chatId: reply.threadChatId,
        parentChatId: chatId,
        sequence: reply.message.sequence,
        serverId,
        threadAnchorMessageId: anchor.message.id,
    });
    reads.stop();
});

test('a departure ends the departed member sentinel stream and names the member', async () => {
    const leaver = await signIn('user_topics_leaver');
    const leaverId = await joinAsMember(leaver, 'user_topics_leaver', serverId, 'topics-leaver');
    const sentinel = collectStream(leaver.trpc.server.onUpdated, { serverId });
    const members = collectStream(owner.trpc.member.onUpdated, { serverId });
    await Promise.all([sentinel.started, members.started]);

    await leaver.trpc.member.leave.mutate({ confirmation: 'topics', serverId });

    await expect(sentinel.ended()).resolves.toMatchObject({
        data: { code: 'FORBIDDEN', hausRefusal: 'membership_lost' },
    });
    await expect(members.next()).resolves.toEqual({ memberId: leaverId, serverId });
    members.stop();
    leaver.close();
});

test('Server deletion ends the sentinel with membership_lost and only that stream', async () => {
    const doomed = await owner.trpc.server.create.mutate({
        displayName: 'Doomed Topics',
        slug: 'doomed-topics',
    });
    const sentinel = collectStream(owner.trpc.server.onUpdated, { serverId: doomed.id });
    const agents = collectStream(owner.trpc.agent.onUpdated, { serverId: doomed.id });
    await Promise.all([sentinel.started, agents.started]);

    await owner.trpc.server.delete.mutate({ confirmation: 'doomed-topics', serverId: doomed.id });

    await expect(sentinel.ended()).resolves.toMatchObject({
        data: { code: 'FORBIDDEN', hausRefusal: 'membership_lost' },
    });
    // Other streams end only on their own next delivery; nothing delivered here.
    await expect(agents.ended(200)).rejects.toThrow(/Timed out/);
    agents.stop();
});

test('chat.message returns the chat.messages projection and enforces Chat access', async () => {
    const anchor = await send('entity anchor', 'topics-entity-anchor');
    await peer.trpc.chat.send.mutate({
        chatId,
        content: 'entity reply',
        nonce: 'topics-entity-reply',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    await owner.trpc.chat.react.mutate({ emoji: '🎉', messageId: anchor.message.id, serverId });

    const page = await owner.trpc.chat.messages.query({ chatId, serverId });
    const entity = await owner.trpc.chat.message.query({
        chatId,
        messageId: anchor.message.id,
        serverId,
    });
    expect(entity).toEqual({
        message: page.messages.find((message) => message.id === anchor.message.id),
        thread: page.threads.find((thread) => thread.anchorMessageId === anchor.message.id),
    });
    expect(entity?.thread?.replyCount).toBe(1);

    const lone = await send('entity without a Thread', 'topics-entity-lone');
    await expect(
        owner.trpc.chat.message.query({ chatId, messageId: lone.message.id, serverId })
    ).resolves.toMatchObject({ message: { id: lone.message.id }, thread: null });
    await expect(
        owner.trpc.chat.message.query({ chatId, messageId: 'msg_foreign000000000', serverId })
    ).resolves.toBeNull();

    const stranger = await signIn('user_topics_stranger');
    await joinAsMember(stranger, 'user_topics_stranger', serverId, 'topics-stranger');
    await expect(
        stranger.trpc.chat.message.query({ chatId, messageId: anchor.message.id, serverId })
    ).rejects.toThrow();
    stranger.close();
});

test('a filtered tail read reports a scan position past its last match', async () => {
    const root = await send('chain root', 'topics-chain-root');
    await send('chain reply', 'topics-chain-reply', root.message.id);
    const unrelated = await send('unrelated after the chain', 'topics-unrelated');

    const chain = await owner.trpc.chat.messages.query({
        afterSequence: root.message.sequence - 1,
        chatId,
        replyRootMessageId: root.message.id,
        serverId,
    });
    expect(chain.messages.map((message) => message.content)).toEqual(['chain root', 'chain reply']);
    expect(chain.nextAfterSequence).toBeNull();
    expect(chain.scannedThroughSequence).toBe(unrelated.message.sequence);
});

function send(content: string, nonce: string, replyToMessageId?: string) {
    return owner.trpc.chat.send.mutate({
        chatId,
        content,
        nonce,
        serverId,
        ...(replyToMessageId ? { replyToMessageId } : {}),
    });
}

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}

/** Mints the human's User through their own Server, then adds them as a member. */
async function joinAsMember(client: HausClient, subject: string, target: string, slug: string) {
    await client.trpc.server.create.mutate({ displayName: `${slug} root`, slug: `${slug}-root` });
    const [user] = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    const userId = user?.id ?? '';
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values (${`mem_${slug}`}, ${target}, ${userId}, 'member')
    `;
    return userId;
}

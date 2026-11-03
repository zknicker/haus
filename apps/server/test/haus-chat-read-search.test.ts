import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let peer: HausClient;
let chatId: string;
let ownerUserId: string;
let peerUserId: string;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_read_owner');
    peer = await signIn('user_read_peer');

    const server = await owner.trpc.server.create.mutate({
        displayName: 'Read Server',
        slug: 'read-server',
    });
    await peer.trpc.server.create.mutate({ displayName: 'Peer Server', slug: 'read-peer' });
    const users = (await harness.sql`
        select auth_subject, id from users
        where auth_subject in ('user_read_owner', 'user_read_peer')
    `) as { auth_subject: string; id: string }[];
    ownerUserId = users.find((user) => user.auth_subject === 'user_read_owner')?.id ?? '';
    peerUserId = users.find((user) => user.auth_subject === 'user_read_peer')?.id ?? '';

    chatId = server.channels[0].id;
    serverId = server.id;
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_read_peer', ${serverId}, ${peerUserId}, 'member')
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${chatId}, ${peerUserId})
    `;

    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Durable search needle.',
        nonce: 'read-search-1',
        serverId,
    });
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Second Server message.',
        nonce: 'read-search-2',
        serverId,
    });
});

afterAll(async () => {
    owner.close();
    peer.close();
    await harness.close();
});

test('read state advances monotonically and survives a fresh HTTP query', async () => {
    const authors = await harness.sql`
        select distinct author_user_id from chat_messages
        where server_id = ${serverId} and chat_id = ${chatId}
    `;
    expect(authors).toEqual([{ author_user_id: ownerUserId }]);
    expect(peerUserId).not.toBe(ownerUserId);

    await peer.trpc.chat.markRead.mutate({ chatId, sequence: 0, serverId });
    const readers = await harness.sql`
        select reader_user_id, sequence from chat_reads
        where server_id = ${serverId} and chat_id = ${chatId}
    `;
    expect(readers).toEqual([{ reader_user_id: peerUserId, sequence: 0 }]);

    const beforeRead = await peer.trpc.chat.list.query({ serverId });
    expect(beforeRead[0]).toMatchObject({ id: chatId, unreadCount: 2 });

    const marked = await peer.trpc.chat.markRead.mutate({
        chatId,
        sequence: 1,
        serverId,
    });
    expect(marked).toMatchObject({ chatId, sequence: 1, serverId });

    await peer.trpc.chat.markRead.mutate({ chatId, sequence: 0, serverId });
    const afterRead = await peer.trpc.chat.list.query({ serverId });
    expect(afterRead[0]).toMatchObject({ id: chatId, unreadCount: 1 });
});

test('PostgreSQL search returns only authorized Server messages', async () => {
    const results = await peer.trpc.chat.search.query({
        query: 'needle',
        serverId,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
        chatId,
        content: 'Durable search needle.',
        serverId,
    });

    const plan = await harness.sql.begin(async (tx) => {
        await tx`set local enable_seqscan = off`;
        return await tx`
            explain (format json)
            select id from chat_messages
            where search_vector @@ websearch_to_tsquery('simple', 'needle')
        `;
    });
    expect(JSON.stringify(plan)).toContain('chat_messages_search_idx');
});

test('search narrows by author and time window', async () => {
    await peer.trpc.chat.send.mutate({
        chatId,
        content: 'Peer needle reply.',
        nonce: 'read-search-3',
        serverId,
    });

    const unfiltered = await peer.trpc.chat.search.query({ query: 'needle', serverId });
    expect(unfiltered).toHaveLength(2);

    const fromOwner = await peer.trpc.chat.search.query({
        authorUserId: ownerUserId,
        query: 'needle',
        serverId,
    });
    expect(fromOwner).toHaveLength(1);
    expect(fromOwner[0]).toMatchObject({ content: 'Durable search needle.' });

    const futureOnly = await peer.trpc.chat.search.query({
        after: new Date(Date.now() + 60_000).toISOString(),
        query: 'needle',
        serverId,
    });
    expect(futureOnly).toHaveLength(0);

    const recent = await peer.trpc.chat.search.query({
        after: new Date(Date.now() - 60_000).toISOString(),
        query: 'needle',
        serverId,
    });
    expect(recent).toHaveLength(2);
});

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}

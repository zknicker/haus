import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chatLifecycleTopic } from '../src/realtime/topics.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureTopic, settleRealtime } from './realtime-capture.ts';
import { collectStream } from './realtime-stream.ts';

let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let peer: HausClient;
let byteFirst: HausClient;
let byteSecond: HausClient;
let ownerServerId: string;
let outsiderUserId: string;
let peerUserId: string;

// Fixed ids whose byte order ('Z' before 'h') disagrees with the collation
// order most databases default to ('h' before 'Z'). Random ids only land on
// this shape about one pair in eight, so the pair is pinned here.
const byteFirstUserId = 'usr_Zcollation0001';
const byteSecondUserId = 'usr_hcollation0002';

beforeAll(async () => {
    harness = await startHausServerHarness({ postgresIcuLocale: 'en-US' });
    owner = await signIn('user_dm_owner');
    outsider = await signIn('user_dm_outsider');
    peer = await signIn('user_dm_peer');
    await harness.sql`
        insert into users (id, auth_subject) values
            (${byteFirstUserId}, 'user_dm_byte_first'),
            (${byteSecondUserId}, 'user_dm_byte_second')
    `;
    byteFirst = await signIn('user_dm_byte_first');
    byteSecond = await signIn('user_dm_byte_second');

    const ownerServer = await owner.trpc.server.create.mutate({
        displayName: 'DM Server',
        slug: 'dm-server',
    });
    await peer.trpc.server.create.mutate({ displayName: 'Peer Root', slug: 'peer-root' });
    await outsider.trpc.server.create.mutate({
        displayName: 'Outsider Root',
        slug: 'outsider-root',
    });
    ownerServerId = ownerServer.id;
    outsiderUserId = await readUserId('user_dm_outsider');
    peerUserId = await readUserId('user_dm_peer');

    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values
            ('mem_dm_peer', ${ownerServerId}, ${peerUserId}, 'member'),
            ('mem_dm_outsider', ${ownerServerId}, ${outsiderUserId}, 'member'),
            ('mem_dm_byte_first', ${ownerServerId}, ${byteFirstUserId}, 'member'),
            ('mem_dm_byte_second', ${ownerServerId}, ${byteSecondUserId}, 'member')
    `;
});

afterAll(async () => {
    owner.close();
    outsider.close();
    peer.close();
    byteFirst.close();
    byteSecond.close();
    await harness.close();
});

// Runs first so it observes the owner/peer DM's first resolution rather than
// opening a second pair.
test('a first DM resolution emits one lifecycle event scoped to its two members', async () => {
    const input = { serverId: ownerServerId };
    const streams = [owner, peer, outsider].map((client) =>
        collectStream(client.trpc.chat.onLifecycle, input)
    );
    await Promise.all(streams.map((stream) => stream.started));
    const [ownerStream, peerStream, outsiderStream] = streams;
    const dm = await owner.trpc.chat.ensureDm.mutate({ peerUserId, serverId: ownerServerId });
    const created = { action: 'created', chatId: dm.id, serverId: ownerServerId };

    await expect(ownerStream?.next()).resolves.toEqual(created);
    await expect(peerStream?.next()).resolves.toEqual(created);
    // A deletion reaches every member, so it fences the outsider's stream: the
    // DM's creation would have arrived first.
    chatLifecycleTopic.announce({
        action: 'deleted',
        chatId: 'cht_dm_fence',
        serverId: ownerServerId,
    });
    await expect(outsiderStream?.next()).resolves.toMatchObject({ chatId: 'cht_dm_fence' });
    for (const stream of streams) {
        stream.stop();
    }

    const reopen = captureTopic(chatLifecycleTopic);
    const ownerUserId = await readUserId('user_dm_owner');
    await expect(
        peer.trpc.chat.ensureDm.mutate({ peerUserId: ownerUserId, serverId: ownerServerId })
    ).resolves.toMatchObject({ id: dm.id });
    await settleRealtime();
    expect(reopen.events).toEqual([]);
    reopen.stop();
});

test('DM access and rows fail closed across participants and Servers', async () => {
    const ownerUserId = await readUserId('user_dm_owner');
    const dm = await owner.trpc.chat.ensureDm.mutate({
        peerUserId,
        serverId: ownerServerId,
    });
    const outsiderServer = await outsider.trpc.server.bySlug.query({ slug: 'outsider-root' });

    await expect(
        outsider.trpc.chat.messages.query({ chatId: dm.id, serverId: ownerServerId })
    ).rejects.toThrow(/participant/i);
    await expect(
        owner.trpc.chat.messages.query({ chatId: dm.id, serverId: outsiderServer.id })
    ).rejects.toThrow();

    const crossServerInsert = harness.sql`
        insert into chat_messages (
            id, server_id, chat_id, sequence, author_user_id, content, nonce
        ) values (
            'msg_cross_server_denied',
            ${outsiderServer.id},
            ${dm.id},
            1,
            ${ownerUserId},
            'must fail',
            'cross-server-denied'
        )
    `;
    let insertError: unknown;
    try {
        await crossServerInsert;
    } catch (error) {
        insertError = error;
    }
    expect(insertError).toBeInstanceOf(Error);
    expect((insertError as Error).message).toMatch(/foreign key/i);
});

test('a DM has one canonical sorted member pair and no duplicated participant rows', async () => {
    const ownerDm = await owner.trpc.chat.ensureDm.mutate({
        peerUserId,
        serverId: ownerServerId,
    });
    const ownerUserId = await readUserId('user_dm_owner');
    const peerDm = await peer.trpc.chat.ensureDm.mutate({
        peerUserId: ownerUserId,
        serverId: ownerServerId,
    });

    expect(peerDm.id).toBe(ownerDm.id);
    expect(ownerDm).toMatchObject({ kind: 'dm', serverId: ownerServerId });

    const pairs = (await harness.sql`
        select dm_member_one_user_id, dm_member_two_user_id
        from chats where server_id = ${ownerServerId} and id = ${ownerDm.id}
    `) as { dm_member_one_user_id: string; dm_member_two_user_id: string }[];

    expect(pairs).toEqual([
        {
            dm_member_one_user_id: [ownerUserId, peerUserId].sort()[0],
            dm_member_two_user_id: [ownerUserId, peerUserId].sort()[1],
        },
    ]);
    const participants = await harness.sql`
        select count(*)::int as total from channel_participants
        where server_id = ${ownerServerId} and chat_id = ${ownerDm.id}
    `;
    expect(participants).toEqual([{ total: 0 }]);
});

test('a member pair whose collation order fights byte order still opens one DM', async () => {
    const [ordering] = (await harness.sql`
        select
            (${byteFirstUserId}::text < ${byteSecondUserId}::text) as collation_first,
            (${byteFirstUserId}::text collate "C" < ${byteSecondUserId}::text collate "C")
                as byte_first
    `) as { byte_first: boolean; collation_first: boolean }[];

    // Guards the regression: if the database's default collation ever matched
    // byte order, this pair would stop exercising the disagreement.
    expect(ordering).toEqual({ byte_first: true, collation_first: false });

    const dm = await byteFirst.trpc.chat.ensureDm.mutate({
        peerUserId: byteSecondUserId,
        serverId: ownerServerId,
    });

    await expect(
        byteSecond.trpc.chat.ensureDm.mutate({
            peerUserId: byteFirstUserId,
            serverId: ownerServerId,
        })
    ).resolves.toMatchObject({ id: dm.id });

    const pairs = await harness.sql`
        select dm_member_one_user_id, dm_member_two_user_id
        from chats where server_id = ${ownerServerId} and id = ${dm.id}
    `;

    expect(pairs).toEqual([
        {
            dm_member_one_user_id: byteFirstUserId,
            dm_member_two_user_id: byteSecondUserId,
        },
    ]);
});

test('opening an existing DM returns its current peer identity and unread count', async () => {
    const dm = await owner.trpc.chat.ensureDm.mutate({
        peerUserId,
        serverId: ownerServerId,
    });
    const sent = await owner.trpc.chat.send.mutate({
        chatId: dm.id,
        content: 'Unread DM',
        nonce: 'dm-unread',
        serverId: ownerServerId,
    });
    if (sent.message.author.kind !== 'human') {
        throw new Error('A human DM send must retain its human author.');
    }
    const reopened = await peer.trpc.chat.ensureDm.mutate({
        peerUserId: sent.message.author.userId,
        serverId: ownerServerId,
    });

    expect(reopened).toMatchObject({
        id: dm.id,
        peerUserId: sent.message.author.userId,
        unreadCount: 1,
    });
});

test('a revoked member cannot be opened as a DM peer', async () => {
    await harness.sql`
        update server_memberships set revoked_at = now()
        where server_id = ${ownerServerId} and user_id = ${peerUserId}
    `;

    await expect(
        owner.trpc.chat.ensureDm.mutate({
            peerUserId,
            serverId: ownerServerId,
        })
    ).rejects.toThrow(/not a member/i);
});

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}

async function readUserId(subject: string) {
    const rows = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];

    return rows[0].id;
}

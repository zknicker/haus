import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type NeedsYouFixture, startNeedsYouFixture } from './needs-you-fixture.ts';

let fixture: NeedsYouFixture;

beforeAll(async () => {
    fixture = await startNeedsYouFixture();
});

afterAll(async () => {
    await fixture.close();
});

test('a human DM row names its peer human and no peer Agent', async () => {
    const { ownerUserId, peer, peerUserId, rowFor, serverId } = fixture;
    const dmChatId = (await peer.trpc.chat.ensureDm.mutate({ peerUserId: ownerUserId, serverId }))
        .id;
    await peer.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Got a minute?',
        nonce: 'needs-human-dm',
        serverId,
    });
    expect(await rowFor(dmChatId)).toMatchObject({
        chatKind: 'dm',
        chatPeerAgentId: null,
        chatPeerUserId: peerUserId,
        latest: { author: { kind: 'human', userId: peerUserId } },
        reason: 'dm',
    });
});

test('every unanswered DM message counts until a reply in that DM', async () => {
    const { mintRunner, orbitAgentId, owner, rowFor, sendAgentMessage, serverId } = fixture;
    const dmChatId = (
        await owner.trpc.chat.ensureAgentDm.mutate({ agentId: orbitAgentId, serverId })
    ).id;
    const orbit = await mintRunner(orbitAgentId, 'run_needs_dm', dmChatId);
    await sendAgentMessage(orbit, 'dm:@ada', 'needs-dm-1', 'Staged the migration.');
    const second = await sendAgentMessage(orbit, 'dm:@ada', 'needs-dm-2', 'Should I run it?');

    expect(await rowFor(dmChatId)).toMatchObject({
        addressedCount: 2,
        chatKind: 'dm',
        chatPeerAgentId: orbitAgentId,
        chatPeerUserId: null,
        conversationChatId: dmChatId,
        latest: { author: { agentId: orbitAgentId, kind: 'agent' }, messageId: second.messageId },
        reason: 'dm',
        threadAnchorMessageId: null,
    });
    await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Run it.',
        nonce: 'needs-dm-reply',
        serverId,
    });
    expect(await rowFor(dmChatId)).toBeUndefined();

    const third = await sendAgentMessage(orbit, 'dm:@ada', 'needs-dm-3', 'Done. Anything else?');
    expect(await rowFor(dmChatId)).toMatchObject({
        addressedCount: 1,
        latest: { messageId: third.messageId },
    });
});

test('Done covers through a sequence, moves the read marker, and newer addressing returns', async () => {
    const {
        createChannel,
        harness,
        mintRunner,
        orbitAgentId,
        owner,
        ownerUserId,
        rowFor,
        sendAgentMessage,
        serverId,
    } = fixture;
    const channelId = await createChannel('done');
    const orbit = await mintRunner(orbitAgentId, 'run_needs_done', channelId);
    await sendAgentMessage(orbit, '#done', 'needs-done-1', '@ada first?');
    const covered = await rowFor(channelId);
    const head = await owner.trpc.chat.eventHead.query({ serverId });

    await expect(
        owner.trpc.inbox.markDone.mutate({
            chatId: channelId,
            serverId,
            throughSequence: (covered?.latest.sequence ?? 0) + 1,
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    await expect(
        owner.trpc.inbox.markDone.mutate({
            chatId: channelId,
            serverId,
            throughSequence: covered?.latest.sequence ?? 0,
        })
    ).resolves.toEqual({ chatId: channelId, doneSequence: covered?.latest.sequence });
    expect(await rowFor(channelId)).toBeUndefined();
    expect(
        await harness.sql`
            select sequence, done_sequence from chat_reads
            where server_id = ${serverId} and chat_id = ${channelId}
              and reader_user_id = ${ownerUserId}
        `
    ).toEqual([{ done_sequence: covered?.latest.sequence, sequence: covered?.latest.sequence }]);
    const events = await owner.trpc.chat.events.query({ afterCursor: head.cursor, serverId });
    expect(events.filter((event) => event.type === 'chat.read')).toEqual([
        expect.objectContaining({ chatId: channelId, sequence: covered?.latest.sequence }),
    ]);

    const newer = await sendAgentMessage(orbit, '#done', 'needs-done-2', '@ada second?');
    expect(await rowFor(channelId)).toMatchObject({
        addressedCount: 1,
        latest: { messageId: newer.messageId },
    });
});

test('Needs you and Done are scoped to Chats the viewer can see', async () => {
    const {
        createChannel,
        mintRunner,
        orbitAgentId,
        outsider,
        sendAgentMessage,
        serverId,
        signIn,
    } = fixture;
    const channelId = await createChannel('private-ops');
    const orbit = await mintRunner(orbitAgentId, 'run_needs_scope', channelId);
    await sendAgentMessage(orbit, '#private-ops', 'needs-scope-1', 'Paging @cass here.');

    // Cass is mentioned but is not in the Channel, so nothing reaches her.
    expect(
        (await outsider.trpc.inbox.needsYou.query({ serverId })).some(
            (row) => row.conversationChatId === channelId
        )
    ).toBe(false);
    await expect(
        outsider.trpc.inbox.markDone.mutate({ chatId: channelId, serverId, throughSequence: 1 })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });

    const stranger = await signIn('user_needs_stranger', ['dee@haus.test']);
    await expect(stranger.trpc.inbox.needsYou.query({ serverId })).rejects.toThrow(/not a member/i);
    stranger.close();
});

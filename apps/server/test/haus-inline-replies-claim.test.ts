import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createInlineReplyHelpers } from './haus-inline-replies-helpers.ts';

const fixture = agentCreationFixture();
const { follows, recipients, sendAgentMessage, sendAgentRequest } =
    createInlineReplyHelpers(fixture);

test('inline reply claims stay isolated and nonce retries keep ancestry', async () => {
    const orbit = await fixture.mintRunner('run_inline_claim_orbit');
    const peer = await fixture.mintRunner(
        'run_inline_claim_peer',
        fixture.peerAgentId,
        fixture.channelId
    );
    await fixture.post('/api/agent/channels/add', orbit, {
        agent: '@peer',
        target: '#product',
    });

    const raceRoot = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Only one Agent may claim this root.',
        nonce: 'inline_claim_race_root',
        serverId: fixture.serverId,
    });
    const raceClaims = await Promise.all([
        fixture.post('/api/agent/tasks/claim', orbit, {
            messageId: raceRoot.message.id,
            target: '#product',
        }),
        fixture.post('/api/agent/tasks/claim', peer, {
            messageId: raceRoot.message.id,
            target: '#product',
        }),
    ]);
    expect(raceClaims.map(({ status }) => status).sort()).toEqual([200, 409]);
    const raceFollowRows = await follows(raceRoot.message.id);
    expect(raceFollowRows).toHaveLength(1);
    expect(raceFollowRows[0]?.followed).toBe(true);
    const winningIndex = raceClaims.findIndex(({ status }) => status === 200);
    const winner = winningIndex === 0 ? orbit : peer;
    const loser = winningIndex === 0 ? peer : orbit;
    const taskNumber = (
        raceClaims[winningIndex]?.body as { claimed?: Array<{ number: number }> } | undefined
    )?.claimed?.[0]?.number;
    expect(taskNumber).toBeTypeOf('number');
    const completed = await fixture.post('/api/agent/tasks/update', winner, {
        number: taskNumber,
        status: 'done',
        target: '#product',
    });
    expect(completed.status).toBe(200);
    expect(await follows(raceRoot.message.id)).toEqual([
        {
            agentId: winningIndex === 0 ? fixture.orbitAgentId : fixture.peerAgentId,
            followed: true,
        },
    ]);

    const authoredRoot = await sendAgentMessage(orbit.token, {
        content: 'The root author may leave before a later claim.',
        nonce: 'inline_claim_false_root',
        target: '#product',
    });
    expect(authoredRoot.status).toBe(200);
    const authoredReply = await sendAgentMessage(orbit.token, {
        content: 'This later message will become claimed work.',
        nonce: 'inline_claim_false_later',
        replyToMessageId: authoredRoot.body.message?.id,
        target: '#product',
    });
    expect(authoredReply.status).toBe(200);
    const authoredRootId = authoredRoot.body.message?.id;
    const authoredReplyId = authoredReply.body.message?.id;
    expect(authoredRootId).toBeTypeOf('string');
    expect(authoredReplyId).toBeTypeOf('string');
    const leftBeforeClaim = await fixture.post('/api/agent/messages/unfollow', orbit, {
        messageId: authoredRootId ?? '',
        target: '#product',
    });
    expect(leftBeforeClaim.status).toBe(200);
    const claimedLater = await fixture.post('/api/agent/tasks/claim', peer, {
        messageId: authoredReplyId ?? '',
        target: '#product',
    });
    expect(claimedLater.status).toBe(200);
    const authoredFollows = await follows(authoredRootId ?? '');
    expect(authoredFollows).toHaveLength(2);
    expect(authoredFollows).toEqual(
        expect.arrayContaining([
            { agentId: fixture.orbitAgentId, followed: false },
            { agentId: fixture.peerAgentId, followed: true },
        ])
    );

    const isolatedRoot = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'A second root has a different owner.',
        nonce: 'inline_isolated_root',
        serverId: fixture.serverId,
    });
    const isolatedClaim = await fixture.post('/api/agent/tasks/claim', loser, {
        messageId: isolatedRoot.message.id,
        target: '#product',
    });
    expect(isolatedClaim.status).toBe(200);
    const raceFollowUp = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Completion does not erase the original chain follow.',
        nonce: 'inline_claim_race_follow_up',
        replyToMessageId: raceRoot.message.id,
        serverId: fixture.serverId,
    });
    const isolatedFollowUp = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'This reply stays with the second root owner.',
        nonce: 'inline_isolated_follow_up',
        replyToMessageId: isolatedRoot.message.id,
        serverId: fixture.serverId,
    });
    expect(await recipients(raceFollowUp.message.id)).toEqual([
        {
            agentId: winningIndex === 0 ? fixture.orbitAgentId : fixture.peerAgentId,
            mentioned: false,
        },
    ]);
    expect(await recipients(isolatedFollowUp.message.id)).toEqual([
        {
            agentId: winningIndex === 0 ? fixture.peerAgentId : fixture.orbitAgentId,
            mentioned: false,
        },
    ]);

    const unfollowAllRoot = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Both Agents will explicitly leave this chain.',
        nonce: 'inline_unfollow_all_root',
        serverId: fixture.serverId,
    });
    for (const agent of [orbit, peer]) {
        expect(
            (
                await fixture.post('/api/agent/messages/follow', agent, {
                    messageId: unfollowAllRoot.message.id,
                    target: '#product',
                })
            ).status
        ).toBe(200);
        expect(
            (
                await fixture.post('/api/agent/messages/unfollow', agent, {
                    messageId: unfollowAllRoot.message.id.slice(4, 12),
                    target: '#product',
                })
            ).status
        ).toBe(200);
    }
    const unfollowAllReply = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'An all-unfollowed chain stays quiet.',
        nonce: 'inline_unfollow_all_reply',
        replyToMessageId: unfollowAllRoot.message.id,
        serverId: fixture.serverId,
    });
    expect(await recipients(unfollowAllReply.message.id)).toEqual([]);
    expect(await follows(unfollowAllRoot.message.id)).toEqual(
        [fixture.orbitAgentId, fixture.peerAgentId]
            .sort()
            .map((agentId) => ({ agentId, followed: false }))
    );

    const otherChannel = await fixture.owner.trpc.chat.createChannel.mutate({
        agentIds: [fixture.orbitAgentId],
        name: 'inline-other',
        serverId: fixture.serverId,
    });
    await expect(
        fixture.owner.trpc.chat.send.mutate({
            chatId: otherChannel.id,
            content: 'This cross-chat parent must be rejected.',
            nonce: 'inline_wrong_chat',
            replyToMessageId: raceRoot.message.id,
            serverId: fixture.serverId,
        })
    ).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
        message: 'That inline reply parent does not exist in this Chat.',
    });
    expect(
        await fixture.harness.sql`
            select id from chat_messages
            where server_id = ${fixture.serverId} and nonce = 'inline_wrong_chat'
        `
    ).toEqual([]);

    const dmRoot = await fixture.owner.trpc.chat.send.mutate({
        agentId: fixture.orbitAgentId,
        content: 'A DM root for nonce replay.',
        nonce: 'inline_dm_root',
        serverId: fixture.serverId,
        targetKind: 'agent-dm',
    });
    const dmBody = {
        content: 'The same reply send is idempotent.',
        nonce: 'inline_dm_reply_nonce',
        replyToMessageId: dmRoot.message.id,
        target: 'dm:@ada',
    };
    const firstDmReply = await sendAgentRequest(orbit.token, dmBody);
    const replayedDmReply = await sendAgentRequest(orbit.token, dmBody);
    expect(firstDmReply.status).toBe(200);
    expect(replayedDmReply.status).toBe(200);
    expect(replayedDmReply.body.message?.id).toBe(firstDmReply.body.message?.id);
    expect(
        await fixture.harness.sql`
            select id from chat_messages
            where server_id = ${fixture.serverId} and nonce = ${dmBody.nonce}
        `
    ).toHaveLength(1);
    const secondDmRoot = await fixture.owner.trpc.chat.send.mutate({
        agentId: fixture.orbitAgentId,
        content: 'A different DM parent.',
        nonce: 'inline_dm_second_root',
        serverId: fixture.serverId,
        targetKind: 'agent-dm',
    });
    const conflictingDmReply = await sendAgentRequest(orbit.token, {
        ...dmBody,
        replyToMessageId: secondDmRoot.message.id,
    });
    expect(conflictingDmReply.status).toBe(409);
});

test('unfollowing an older root preserves the author’s departure', async () => {
    const orbit = await fixture.mintRunner('run_inline_old_root');
    const root = await sendAgentMessage(orbit.token, {
        content: 'A conversation created before reply subscriptions.',
        nonce: 'inline_old_root',
        target: '#product',
    });
    expect(root.status).toBe(200);
    const rootId = root.body.message?.id ?? '';
    await fixture.harness.sql`
        delete from agent_message_follows
        where server_id = ${fixture.serverId} and root_message_id = ${rootId}
    `;
    const left = await fixture.post('/api/agent/messages/unfollow', orbit, {
        messageId: rootId,
        target: '#product',
    });
    expect(left.status).toBe(200);
    const reply = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'A later follow-up.',
        nonce: 'inline_old_root_reply',
        replyToMessageId: rootId,
        serverId: fixture.serverId,
    });
    expect(await follows(rootId)).toEqual([{ agentId: fixture.orbitAgentId, followed: false }]);
    expect(await recipients(reply.message.id)).toEqual([]);
});

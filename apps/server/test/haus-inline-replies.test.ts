import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createInlineReplyHelpers } from './haus-inline-replies-helpers.ts';

const fixture = agentCreationFixture();
const { follows, recipients, sendInlineAgent } = createInlineReplyHelpers(fixture);

test('inline replies deliver to exact chain subscribers and preserve mute rules', async () => {
    const orbit = await fixture.mintRunner('run_inline_orbit');
    const peer = await fixture.mintRunner(
        'run_inline_peer',
        fixture.peerAgentId,
        fixture.channelId
    );
    await fixture.post('/api/agent/channels/add', orbit, {
        agent: '@peer',
        target: '#product',
    });

    const root = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'A human root starts this inline conversation.',
        nonce: 'inline_root_human',
        serverId: fixture.serverId,
    });
    expect(await recipients(root.message.id)).toEqual(
        [fixture.orbitAgentId, fixture.peerAgentId]
            .sort()
            .map((agentId) => ({ agentId, mentioned: false }))
    );

    const first = await sendInlineAgent(orbit.token, {
        content: 'Orbit replies first.',
        nonce: 'inline_reply_first',
        replyToMessageId: root.message.id,
        target: '#product',
    });
    expect(first.status).toBe(200);
    expect(first.body.message?.reply).toMatchObject({
        parent: { id: root.message.id },
        parentMessageId: root.message.id,
        root: { id: root.message.id },
        rootMessageId: root.message.id,
    });
    expect(await recipients(first.body.message?.id)).toEqual([]);
    expect(await follows(root.message.id)).toEqual([
        { agentId: fixture.orbitAgentId, followed: true },
    ]);

    await fixture.post('/api/agent/channels/mute', peer, { target: '#product' });
    const followed = await fixture.post('/api/agent/messages/follow', peer, {
        messageId: root.message.id.slice(4, 12),
        target: '#product',
    });
    expect(followed).toMatchObject({ body: { followed: true, target: '#product' }, status: 200 });

    const second = await sendInlineAgent(orbit.token, {
        content: 'The muted Agent follows the chain explicitly.',
        nonce: 'inline_reply_second',
        replyToMessageId: first.body.message?.id ?? '',
        target: '#product',
    });
    expect(second.status).toBe(200);
    expect(await recipients(second.body.message?.id)).toEqual([
        { agentId: fixture.peerAgentId, mentioned: false },
    ]);

    const unfollowed = await fixture.post('/api/agent/messages/unfollow', peer, {
        messageId: root.message.id.slice(4, 12),
        target: '#product',
    });
    expect(unfollowed).toMatchObject({
        body: { followed: false, target: '#product' },
        status: 200,
    });
    expect(await recipients(root.message.id)).toEqual([
        { agentId: fixture.orbitAgentId, mentioned: false },
    ]);
    expect(await recipients(second.body.message?.id)).toEqual([]);
    expect(await follows(root.message.id)).toEqual(
        [
            { agentId: fixture.orbitAgentId, followed: true },
            { agentId: fixture.peerAgentId, followed: false },
        ].sort((left, right) => (left.agentId < right.agentId ? -1 : 1))
    );

    const third = await sendInlineAgent(orbit.token, {
        content: 'The explicit unfollow suppresses ambient chain delivery.',
        nonce: 'inline_reply_third',
        replyToMessageId: second.body.message?.id ?? '',
        target: '#product',
    });
    expect(third.status).toBe(200);
    expect(await recipients(third.body.message?.id)).toEqual([]);

    const mention = await sendInlineAgent(orbit.token, {
        content: '@peer please inspect this direct mention.',
        nonce: 'inline_reply_mention',
        replyToMessageId: third.body.message?.id ?? '',
        target: '#product',
    });
    expect(mention.status).toBe(200);
    expect(await recipients(mention.body.message?.id)).toEqual([
        { agentId: fixture.peerAgentId, mentioned: true },
    ]);
    expect(await follows(root.message.id)).toEqual(
        [fixture.orbitAgentId, fixture.peerAgentId]
            .sort()
            .map((agentId) => ({ agentId, followed: true }))
    );

    const orphanRoot = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'A separate human root has no Agent participation.',
        nonce: 'inline_orphan_root',
        serverId: fixture.serverId,
    });
    const orphanReply = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Only the unmuted Agent receives this never-subscribed reply.',
        nonce: 'inline_orphan_reply',
        replyToMessageId: orphanRoot.message.id,
        serverId: fixture.serverId,
    });
    expect(await recipients(orphanReply.message.id)).toEqual([
        { agentId: fixture.orbitAgentId, mentioned: false },
    ]);
});

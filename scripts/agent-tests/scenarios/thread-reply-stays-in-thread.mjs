// A mention inside a Thread is answered inside that exact Thread. The parent
// channel must stay clean: a Thread reply that spills into the channel is the
// failure this scenario exists to catch.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An Agent mentioned in a Thread answers in that Thread chat with exactly one reply carrying the requested marker and authors nothing in the parent channel.',
    name: 'thread-reply-stays-in-thread',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const token = marker('THREAD');

        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const channelHead = await kit.readHead(channel.id);

        log('anchoring a Thread');
        const anchor = await send(kit, {
            chatId: channel.id,
            content: `Bluebird thread anchor ${kit.stamp}`,
        });
        const threadReceipt = await send(kit, {
            chatId: channel.id,
            content: `@${worker.handle} Reply in this Thread only with ${token}.`,
            thread: { anchorMessageId: anchor.message.id },
        });

        const threadChatId = threadReceipt.threadChatId;
        expect(threadChatId, 'Thread chat id on the send receipt').toBeTruthy();
        await kit.trackChat(threadChatId);

        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');
        expect(turn.outputProduced, 'turn produced durable output').toBe(true);

        log('checking gates');
        const threadReplies = kit.authoredBy(await kit.readMessages(threadChatId), worker.id);
        expect(threadReplies, 'replies in the Thread').toContain(token);
        expect(threadReplies, 'replies in the Thread').toHaveLength(1);

        const channelMessages = await kit.readMessages(channel.id);
        expect(
            kit.authoredBy(channelMessages, worker.id, channelHead),
            'replies in the parent channel'
        ).toHaveLength(0);
    }),
});

/** Owner send through the same hosted contract the App composer uses. */
function send(kit, { chatId, content, thread }) {
    return kit.trpc('chat.send', {
        attachmentIds: [],
        chatId,
        content,
        nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
        serverId: kit.serverId,
        ...(thread ? { thread } : {}),
    });
}

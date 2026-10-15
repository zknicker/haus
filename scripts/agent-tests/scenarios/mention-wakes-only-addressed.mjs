// A direct mention wakes exactly the Agent it names, and the exchange stays
// with that Agent. Turn one: the addressed worker answers once, as an inline
// reply to the request. Turn two: the human follows up without a mention, as
// an inline reply to that answer; the worker answers inline again. The second
// Agent in the same channel writes nothing in either turn. Whether the Server
// narrowed the follow-up away from the bystander or delivered it and the
// bystander chose silence is logged, not gated.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'A mention addressed to one Agent gets exactly one inline reply from that Agent, an unmentioned inline follow-up to that reply is answered inline by the same Agent, and the unaddressed Agent in the channel stays silent everywhere, Threads included.',
    name: 'mention-wakes-only-addressed',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, bystander] = agents;
        const token = marker('MENTION');
        const channel = await kit.createChannel({ agentIds: [worker.id, bystander.id] });
        const head = await kit.readHead(channel.id);

        log('sending the mention');
        const request = await send(
            kit,
            channel.id,
            `@${worker.handle} ${token} quick one: what is 17 times 23?`
        );
        await settled(expect, await settleTurn(worker.id), 'mention turn');
        const answers = (await agentPosts(kit, channel.id, worker.id, head)).filter((message) =>
            message.content.includes('391')
        );
        expect(answers, 'answers from the addressed Agent').toHaveLength(1);
        expect(answers[0].reply?.rootMessageId, 'answer is an inline reply to the request').toBe(
            request.message.id
        );

        log('following up inline without a mention');
        const followHead = await kit.readHead(channel.id);
        const followUp = await send(kit, channel.id, 'And 17 times 19?', answers[0].id);
        await settled(expect, await settleTurn(worker.id), 'follow-up turn');
        const exchange = new Set([request.message.id, answers[0].id, followUp.message.id]);
        const followAnswers = (await agentPosts(kit, channel.id, worker.id, followHead)).filter(
            (message) => message.content.includes('323')
        );
        expect(followAnswers, 'follow-up answers from the addressed Agent').toHaveLength(1);
        expect(
            exchange.has(followAnswers[0].reply?.rootMessageId),
            'follow-up answer stays inline in the exchange'
        ).toBe(true);

        // Silence is only meaningful once the bystander's queue is quiet on the Server.
        await kit.harness.waitForAgentQuiet(bystander.id, 10_000, 300_000);
        const deliveries = (await kit.turns.listDeliveries(bystander.id)) ?? [];
        const delivered = deliveries.some((row) => row.messageId === followUp.message.id);
        log(`bystander follow-up: ${delivered ? 'delivered and silent' : 'narrowed away'}`);
        expect(
            await agentPosts(kit, channel.id, bystander.id, head),
            'posts from the unaddressed Agent'
        ).toHaveLength(0);
    }),
});

function send(kit, chatId, content, replyToMessageId) {
    return kit.trpc('chat.send', {
        chatId,
        content,
        nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
        serverId: kit.serverId,
        ...(replyToMessageId ? { replyToMessageId } : {}),
    });
}

async function settled(expect, turn, label) {
    expect(turn.status, `${label} status`).toBe('completed');
    expect(turn.failureKind ?? 'none', `${label} failure kind`).toBe('none');
}

/** An Agent's posts in a fresh channel since `head`, top level and in every Thread. */
async function agentPosts(kit, chatId, agentId, head) {
    const own = (message) => message.author.kind === 'agent' && message.author.agentId === agentId;
    const posts = (await kit.readMessages(chatId)).filter(
        (message) => own(message) && message.sequence > head
    );
    const page = await kit.trpc('chat.messages', { chatId, limit: 100, serverId: kit.serverId });
    for (const thread of page.threads) {
        await kit.trackChat(thread.threadChatId);
        posts.push(...(await kit.readMessages(thread.threadChatId)).filter(own));
    }
    return posts;
}

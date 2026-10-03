import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

// Multiples of 7 in 1..500: 71; their sum 17,892; 17,892 mod 97 = 44.
const expectedAnswer = '44';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Solo multi-step work keeps at most an acknowledgment and the final answer in the channel, with step-by-step progress in a thread on the Agent’s own acknowledgment.',
    name: 'solo-progress-threads-on-ack',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const token = marker();
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const request = await kit.harness.send(
            channel.id,
            `@${worker.handle} Small investigation for you, run it yourself in the shell and keep me posted as you go: (1) write the numbers 1 to 500 to a file in your workspace, (2) count how many are divisible by 7, (3) sum those, (4) take that sum mod 97. Give me the final number with the exact marker ${token}.`
        );
        const turn = await settleTurn(worker.id);
        const channelPosts = (await turn.authoredMessagesIn(channel.id)).filter(
            (message) => message.chatId === channel.id
        );
        log(`parent chat posts: ${channelPosts.length}`);
        const { threads } = await kit.trpc('chat.messages', {
            chatId: channel.id,
            limit: 100,
            serverId: kit.serverId,
        });
        const ownAnchors = new Set(channelPosts.map((message) => message.id));
        let progressPosts = 0;
        let requestThreadPosts = 0;
        for (const thread of threads) {
            await kit.trackChat(thread.threadChatId);
            const posts = (await turn.authoredMessagesIn(thread.threadChatId)).filter(
                (message) => message.chatId === thread.threadChatId
            );
            log(`thread on ${thread.anchorMessageId}: ${posts.length} worker posts`);
            if (ownAnchors.has(thread.anchorMessageId)) {
                progressPosts += posts.length;
            } else if (thread.anchorMessageId === request.message.id) {
                requestThreadPosts += posts.length;
            }
        }

        expect(turn.status, 'turn completed').toBe('completed');
        expect(channelPosts.length <= 2, 'at most acknowledgment and answer in channel').toBe(true);
        const answer =
            channelPosts.find(
                (message) =>
                    message.content.includes(token) && message.content.includes(expectedAnswer)
            ) ?? channelPosts.find((message) => message.content.includes(token));
        expect(Boolean(answer), 'final answer with marker in channel').toBe(true);
        expect(answer.content.includes(expectedAnswer), 'computed result').toBe(true);
        expect(answer.reply?.rootMessageId, 'answer links to the request').toBe(request.message.id);
        expect(progressPosts > 0, 'progress in a thread on own acknowledgment').toBe(true);
        expect(requestThreadPosts, 'request thread stays empty').toBe(0);
    }),
});

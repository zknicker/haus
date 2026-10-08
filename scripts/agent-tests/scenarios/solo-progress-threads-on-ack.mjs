import { gzipSync } from 'node:zlib';

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

// Multiples of 7 in 1..500: 71; their sum 17,892; 17,892 mod 97 = 44.
const expectedAnswer = '44';

// Each step's instructions are sealed inside the previous step, so the work
// cannot collapse into one shell command: the Agent must run a step and read
// its output before it knows the next one. That makes intermediate progress
// unavoidable, which is what lets `progressPosts > 0` stay a hard gate.
const unpack = (blob) => `echo ${blob} | base64 -d | gunzip`;
const seal = (text) => gzipSync(Buffer.from(text)).toString('base64');
const step4 = seal('Step 4 of 4: take your step 3 sum mod 97. That is the final number to report.');
const step3 = seal(
    `Step 3 of 4: sum the multiples of 7 you counted in step 2. Then unpack step 4: ${unpack(step4)}`
);
const step2 = seal(
    `Step 2 of 4: count how many numbers in that file are divisible by 7. Then unpack step 3: ${unpack(step3)}`
);
const step1 = seal(
    `Step 1 of 4: write the numbers 1 to 500, one per line, to a file in your workspace. Then unpack step 2: ${unpack(step2)}`
);

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
            `@${worker.handle} Small four-step relay puzzle for you, run it yourself in the shell and keep me posted as you go. Each step's instructions are sealed in the step before, so start by unpacking step 1: \`${unpack(step1)}\`. Give me the final number with the exact marker ${token}.`
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

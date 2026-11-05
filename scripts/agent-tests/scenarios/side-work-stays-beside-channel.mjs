// A sidebar in a busy channel: two peers are working through month-end close in
// a finance channel when a human pulls the Agent into an unrelated code review,
// then keeps replying inline through findings, a fix, and a second pass while
// the finance talk carries on around it. Each write-up must be substantial and
// reach the human. The measured behavior is the sidebar moving beside the main
// discussion: at most two Agent posts in the channel across three rounds.
// Placement is the Agent's judgment, so read this as a rate against baseline.

import { wordCount } from '../placement.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const deployScript = `#!/bin/bash
cd /srv/app
git pull
rm -rf $BUILD_DIR/*
npm install
npm run build
cp -r dist/* /var/www/
curl -X POST "https://hooks.example.com/deploy?token=abc123"`;

// Below this a post is a one-liner, and one-liners do not clutter a channel.
const minReportWords = 40;

// The main discussion, carried by two peers; one batch before each round.
const financeTalk = [
    [
        [0, 'Month-end close: October card statements are in, totals look normal.'],
        [1, 'Good. The AWS invoice came in 12% over forecast, looking at why now.'],
        [0, 'Is that the reserved instance renewal? That hit in October last year too.'],
        [1, 'Partly. Renewal explains about 8 points, the rest is data transfer.'],
    ],
    [
        [0, 'Should we accrue the transfer overage in October or wait for the credit memo?'],
        [1, 'Accrue it. The credit memo is not confirmed, so October should carry it.'],
    ],
    [
        [0, 'Accrual booked. Payroll tie-out is next, the contractor batch is still open.'],
        [1, 'Contractor batch closes Thursday, I will reconcile it against the bank feed.'],
    ],
];

const rounds = [
    (handle, token) =>
        `@${handle} unrelated to finance, but you're here: can you review our website deploy script? Give me the full write-up of what's wrong and why it matters, with ${token}.\n\n\`\`\`bash\n${deployScript}\n\`\`\``,
    (handle, token) =>
        `@${handle} seems great. Write the fixed version in your workspace, run \`bash -n\` on it, and give me the full write-up of what you changed and why, with ${token}.`,
    (handle, token) =>
        `@${handle} nice. Do a second review pass on the fixed version and give me the full write-up of anything still risky, with ${token}.`,
];

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }, { kind: 'worker' }],
    contract:
        'Three rounds of substantial code-review write-ups asked during a live finance discussion each reach the human, and the Agent authors at most two posts in the channel itself across all three rounds.',
    name: 'side-work-stays-beside-channel',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, ...peers] = agents;
        const channel = await kit.createChannel({
            agentIds: agents.map((agent) => agent.id),
            name: `finance-${kit.stamp.slice(-6)}-${marker('').toLowerCase()}`,
        });

        let followUp = null;
        for (const [index, round] of rounds.entries()) {
            const token = marker(`R${index + 1}`);
            const content = round(worker.handle, token);
            log(`round ${index + 1}`);
            for (const [peer, line] of financeTalk[index]) {
                await kit.authorAsAgent(peers[peer].id, `#${channel.name}`, line, {
                    chatId: channel.id,
                });
            }
            await sendFollowUp(kit, channel.id, content, followUp);
            const turn = await settleTurn(worker.id);
            expect(turn.status, `round ${index + 1} turn`).toBe('completed');

            const answer = await findAnswer(kit, channel.id, worker.id, token);
            expect(Boolean(answer), `round ${index + 1} answer with marker`).toBe(true);
            const words = wordCount(answer.message.content);
            log(`round ${index + 1} write-up: ${words} words`);
            expect(words >= minReportWords, `round ${index + 1} write-up is substantial`).toBe(
                true
            );
            expect(answer.reachesHuman, `round ${index + 1} answer reaches the human`).toBe(true);
            log(
                `round ${index + 1} answered in ${answer.threadAnchorId ? 'a Thread' : 'the channel'}`
            );
            followUp = answer;
        }

        const channelPosts = kit.authoredBy(await kit.readMessages(channel.id), worker.id);
        log(`Agent posts in the channel: ${channelPosts.length}`);
        expect(channelPosts.length <= 2, 'side work kept to at most two channel posts').toBe(true);
    }),
});

/**
 * The human follows up where the Agent last answered: in that Thread, or as an
 * inline reply to the Agent's answer in the channel.
 */
function sendFollowUp(kit, channelId, content, previous) {
    return kit.trpc('chat.send', {
        attachmentIds: [],
        chatId: channelId,
        content,
        nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
        serverId: kit.serverId,
        ...(previous?.threadAnchorId
            ? { thread: { anchorMessageId: previous.threadAnchorId } }
            : {}),
        ...(previous && !previous.threadAnchorId ? { replyToMessageId: previous.message.id } : {}),
    });
}

/**
 * The Agent's post carrying `token`, in the channel or any of its Threads, and
 * whether it reaches the human: anything in the channel does, while a Thread
 * post does only on a human-authored anchor, whose author is notified.
 */
async function findAnswer(kit, channelId, agentId, token) {
    const page = await kit.trpc('chat.messages', {
        chatId: channelId,
        limit: 100,
        serverId: kit.serverId,
    });
    const own = (message) =>
        message.author.kind === 'agent' &&
        message.author.agentId === agentId &&
        message.content.includes(token);
    const inChannel = page.messages.find(own);
    if (inChannel) {
        return { message: inChannel, reachesHuman: true, threadAnchorId: null };
    }
    for (const thread of page.threads) {
        await kit.trackChat(thread.threadChatId);
        const found = (await kit.readMessages(thread.threadChatId)).find(own);
        if (found) {
            const anchor = page.messages.find((message) => message.id === thread.anchorMessageId);
            return {
                message: found,
                reachesHuman: anchor?.author.kind === 'human',
                threadAnchorId: thread.anchorMessageId,
            };
        }
    }
    return null;
}

// a finance channel when a human pulls the Agent into an unrelated code review,

import { wordCount } from '../placement.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { tasksCreatedBy } from '../task-intake.mjs';

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
        'Three rounds of substantial code-review write-ups asked during a live finance discussion each reach the human, inline or in a Task started from the channel, and the Agent authors at most two posts in the channel itself across all three rounds.',
    name: 'side-work-stays-beside-channel',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, ...peers] = agents;
        const channel = await kit.createChannel({
            agentIds: agents.map((agent) => agent.id),
            name: `finance-${kit.stamp.slice(-6)}-${marker('').toLowerCase()}`,
        });

        const startedAt = new Date().toISOString();
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

            const answer = await findAnswer(kit, channel.id, worker.id, token, startedAt);
            expect(Boolean(answer), `round ${index + 1} answer with marker`).toBe(true);
            const words = wordCount(answer.message.content);
            log(`round ${index + 1} write-up: ${words} words`);
            expect(words >= minReportWords, `round ${index + 1} write-up is substantial`).toBe(
                true
            );
            log(`round ${index + 1} answered in ${answer.taskChatId ? 'a Task' : 'the channel'}`);
            followUp = answer;
        }

        const channelPosts = kit.authoredBy(await kit.readMessages(channel.id), worker.id);
        log(`Agent posts in the channel: ${channelPosts.length}`);
        expect(channelPosts.length <= 2, 'side work kept to at most two channel posts').toBe(true);
    }),
});

/**
 * The human follows up where the Agent last answered: in that Task, or as an
 * inline reply to the Agent's answer in the channel.
 */
function sendFollowUp(kit, channelId, content, previous) {
    return kit.trpc('chat.send', {
        attachmentIds: [],
        chatId: previous?.taskChatId ?? channelId,
        content,
        nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
        serverId: kit.serverId,
        ...(previous && !previous.taskChatId ? { replyToMessageId: previous.message.id } : {}),
    });
}

async function findAnswer(kit, channelId, agentId, token, since) {
    const own = (message) =>
        message.author.kind === 'agent' &&
        message.author.agentId === agentId &&
        message.content.includes(token);
    const inChannel = (await kit.readMessages(channelId)).find(own);
    if (inChannel) {
        return { message: inChannel, taskChatId: null };
    }
    const tasks = (await tasksCreatedBy(kit, agentId, { startedAt: since })).filter(
        (task) => task.origin?.chatId === channelId && task.chatId
    );
    for (const task of tasks) {
        await kit.trackChat(task.chatId);
        const found = (await kit.readMessages(task.chatId)).find(own);
        if (found) {
            return { message: found, taskChatId: task.chatId };
        }
    }
    return null;
}

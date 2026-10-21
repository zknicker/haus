// Peer-claimed work stays with the peer (Manual cards task-claim-lock and
// discuss-then-assign). Seeded with both Agents stopped: the human asks the
// room for shell work, the second Agent claims that message as a task through
// the runner contract and posts a short inline "on it". The human then
// @mentions the first Agent: is anyone already on it, and if not, grab it.
// Only the first Agent is restarted, so it reads the whole exchange in one
// turn. The claim is the lock: it must not claim, re-create, or deliver the
// work, and replies at most once, never in the task Thread. Decoys: doing the
// work anyway (the computed total appears in its post), claiming or creating a
// duplicate task. The peer stays stopped so the lock holder never moves.

import { journalCommands } from '../placement.mjs';
import { agentPostsSince, agentReactions, claimMessageAsAgent } from '../room-a.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

// The sum of the squares of 1..60 is 73,810; any rendering of it is delivery.
const deliveredTotal = /73[,.\s]?810/u;

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'Asked about work a peer Agent has already claimed as a task, the mentioned Agent leaves the task claimed by the peer, creates no second task, never posts the computed result, and writes at most one message, none in the task Thread.',
    name: 'room-task-claimed-by-peer',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, peer] = agents;
        const token = marker('CLAIMED');
        const channel = await kit.createChannel({ agentIds: [worker.id, peer.id] });
        const head = await kit.readHead(channel.id);

        log('seeding the peer claim with both Agents stopped');
        await stop(kit, worker.id);
        await stop(kit, peer.id);
        let mention;
        let request;
        try {
            request = await kit.harness.send(
                channel.id,
                `Can someone run the Bluebird launch-list numbers? In the shell, sum the squares of 1 to 60 and post the total with the exact marker ${token}.`
            );
            await claimMessageAsAgent(kit, {
                agentId: peer.id,
                channel,
                messageId: request.message.id,
            });
            await kit.authorAsAgent(peer.id, `#${channel.name}`, 'On it, running those now.', {
                chatId: channel.id,
                replyToMessageId: request.message.id,
            });
            mention = await kit.harness.send(
                channel.id,
                `@${worker.handle} is someone already on the Bluebird launch-list numbers above? If nobody has it, grab it.`
            );
        } finally {
            await start(kit, worker.id);
        }

        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');

        // A claim-promoted task is background tier, which `task.list` omits, so
        // read tasks off the channel's own messages.
        const tasks = (await kit.readMessages(channel.id)).flatMap((message) =>
            message.task ? [message.task] : []
        );
        expect(tasks, 'tasks in the channel').toHaveLength(1);
        const [task] = tasks;
        await kit.trackChat(task.threadChatId);
        log(`task #${task.number}: ${task.status}, assignee ${task.assigneeAgentId}`);
        expect(task.messageId, 'the task is the seeded request').toBe(request.message.id);
        expect(task.assigneeAgentId, 'task assignee').toBe(peer.id);
        expect(Boolean(task.claimedAt), 'task still claimed').toBe(true);

        const posts = await agentPostsSince(kit, channel.id, worker.id, head);
        log(
            `mentioned Agent posts: ${posts.map((message) => (message.chatId === channel.id ? `channel reply-to=${message.reply?.rootMessageId ?? 'none'}` : `thread ${message.chatId}`)).join('; ') || 'none'}`
        );
        expect(
            posts.filter(
                (message) => deliveredTotal.test(message.content) || message.content.includes(token)
            ),
            'posts delivering the peer-claimed work'
        ).toHaveLength(0);
        expect(posts.length <= 1, 'at most one message from the mentioned Agent').toBe(true);
        expect(
            posts.filter((message) => message.chatId === task.threadChatId),
            'posts in the task Thread'
        ).toHaveLength(0);

        const mentionMessage = (await kit.readMessages(channel.id)).find(
            (message) => message.id === mention.message.id
        );
        log(`reactions on the mention: ${agentReactions(mentionMessage, worker.id).length}`);
        const claims = (await journalCommands(kit, worker.id, turn)).filter((command) =>
            /\bhaus\s+task\s+(?:claim|create)\b/u.test(command)
        );
        log(`task claim/create attempts in the journal: ${claims.length}`);
    }),
});

async function stop(kit, agentId) {
    await kit.trpc('agent.stop', { agentId, serverId: kit.serverId });
}

async function start(kit, agentId) {
    await kit.trpc('agent.start', { agentId, serverId: kit.serverId });
}

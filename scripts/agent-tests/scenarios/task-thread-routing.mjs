// An explicitly created task is claimed before the Agent replies, and the reply
// lands inline in the channel where the request arrived. Agents never post into
// the task Thread on the human's request (ADR 0029).

import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An explicitly created task is claimed by that Agent before it replies, answered inline in the channel where it arrived with the requested marker, and its task Thread stays empty.',
    name: 'task-thread-routing',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [worker] = agents;
        const token = marker();

        const channel = await kit.createChannel({ agentIds: [worker.id] });
        log('sending task');

        const created = await kit.sendTask(
            channel.id,
            `@${worker.handle} Draft a two-sentence Bluebird launch blurb for independent bookstores. Include the exact marker ${token}.`
        );

        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');
        expect(turn.outputProduced, 'turn produced durable output').toBe(true);

        log('checking gates');
        const task = await kit.readTask(created.messageId);
        // A one-shot task may already be advanced past in_progress at settlement;
        // the contract is claim-before-reply, not catching the transient state.
        expect(
            ['in_progress', 'in_review', 'done'].includes(task.status),
            `task status left todo (got ${task.status})`
        ).toBe(true);
        expect(task.assigneeAgentId, 'task assignee').toBe(worker.id);

        // Acknowledge-then-deliver is legitimate; the contract is that delivery
        // lands inline in the channel, not how many messages carry it there.
        const channelReplies = (await turn.authoredMessagesIn(channel.id)).filter(
            (message) => message.chatId === channel.id
        );
        expect(channelReplies.length > 0, 'the channel received a reply').toBe(true);
        expect(
            channelReplies.some((reply) => reply.content.includes(token)),
            `a channel reply carries the marker ${token}`
        ).toBe(true);
        expect(
            Date.parse(task.claimedAt ?? '') <= Date.parse(channelReplies[0].createdAt),
            'claim happened before the first channel reply'
        ).toBe(true);

        expect(
            await turn.authoredMessagesIn(created.threadChatId),
            'replies in the task Thread'
        ).toHaveLength(0);
    },
});

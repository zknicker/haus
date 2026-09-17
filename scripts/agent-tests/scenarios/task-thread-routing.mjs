// A task explicitly requested in a Thread must be answered in that Thread — not in
// the parent channel — and the Agent must take the task while it works.

import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A task explicitly requested in its Thread is claimed by that Agent before it replies, answered in the task Thread, leaves the parent channel silent, and the reply carries the requested marker.',
    name: 'task-thread-routing',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [worker] = agents;
        const token = marker();

        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const channelHead = await kit.readHead(channel.id);
        log('sending task');

        const created = await kit.sendTask(
            channel.id,
            `@${worker.handle} Draft a two-sentence Bluebird launch blurb for independent bookstores. Include the exact marker ${token}. Keep this work in the task thread.`
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

        // Acknowledge-then-deliver is legitimate; the contract is that the
        // delivery lands in the Thread, not how many messages carry it there.
        const threadReplies = await turn.authoredMessagesIn(created.threadChatId);
        expect(threadReplies.length > 0, 'the task Thread received a reply').toBe(true);
        expect(
            threadReplies.some((reply) => reply.content.includes(token)),
            `a task Thread reply carries the marker ${token}`
        ).toBe(true);
        expect(
            Date.parse(task.claimedAt ?? '') <= Date.parse(threadReplies[0].createdAt),
            'claim happened before the first Thread reply'
        ).toBe(true);

        const channelMessages = await kit.readMessages(channel.id);
        expect(
            kit.authoredBy(channelMessages, worker.id, channelHead),
            'replies in the parent channel'
        ).toHaveLength(0);
    },
});

import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A channel request is claimed and answered in that channel, including acknowledgments, while its task Thread stays empty.',
    name: 'task-conversation-routing',
    async run({ agents, expect, kit, marker, settleTurn }) {
        const [worker] = agents;
        const token = marker();
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const head = await kit.readHead(channel.id);
        await kit.harness.send(
            channel.id,
            `@${worker.handle} Use the shell to calculate 17 * 23, then tell me the result with the exact marker ${token}.`
        );
        const turn = await settleTurn(worker.id);
        const { tasks } = await kit.trpc('task.list', {
            includeBackground: true,
            serverId: kit.serverId,
        });
        const promoted = tasks.find((entry) => entry.task.chatId === channel.id);
        expect(promoted, 'request was claimed').toBeTruthy();
        await kit.trackChat(promoted.task.threadChatId);
        expect(turn.status, 'turn status').toBe('completed');
        const replies = kit.authoredBy(await kit.readMessages(channel.id), worker.id, head);
        expect(replies.length > 0, 'channel receives the answer').toBe(true);
        expect(
            replies.some((reply) => reply.includes('391')),
            'calculated result'
        ).toBe(true);
        expect(
            replies.some((reply) => reply.includes(token)),
            'answer carries marker'
        ).toBe(true);
        expect(
            await turn.authoredMessagesIn(promoted.task.threadChatId),
            'task Thread replies'
        ).toHaveLength(0);
        const task = promoted.task;
        expect(task.assigneeAgentId, 'task claimant').toBe(worker.id);
        expect(task.claimedAt, 'task was claimed').toBeTruthy();
        expect(task.status, 'same-turn completion').toBe('done');
    },
});

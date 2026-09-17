import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'A completed channel request keeps its inline follow-ups with its owner, including replies to the human request, without delivering them to a bystander.',
    name: 'inline-reply-followups',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker, bystander] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id, bystander.id] });
        const request = await send(
            kit,
            channel.id,
            `@${worker.handle} Use the shell to calculate 17 * 23 and tell me the result.`
        );
        const first = await settleTurn(worker.id);
        await kit.harness.waitForAgentQuiet(bystander.id, 10_000, 300_000);
        expect(first.status, 'first turn').toBe('completed');
        const answers = await first.authoredMessagesIn(channel.id);
        expect(
            answers.some(
                (message) =>
                    message.content.includes('391') &&
                    message.reply?.rootMessageId === request.message.id
            ),
            'answer stays inline with its request'
        ).toBe(true);
        const initialTask = await taskFor(kit, request.message.id);
        expect(initialTask?.assigneeAgentId, 'request owner').toBe(worker.id);
        expect(initialTask?.status, 'explicitly completed first request').toBe('done');

        log('replying to the original human message after completion, without mentioning anyone');
        const followup = await send(
            kit,
            channel.id,
            'Use the shell again, but change the quantity to 19. What is the new total?',
            request.message.id
        );
        const second = await settleTurn(worker.id);
        expect(second.status, 'follow-up turn').toBe('completed');
        const revised = await second.authoredMessagesIn(channel.id);
        expect(
            revised.some(
                (message) =>
                    message.content.includes('437') &&
                    message.reply?.rootMessageId === request.message.id
            ),
            'owner receives context and answers in the same exchange'
        ).toBe(true);
        const deliveries = await kit.turns.listDeliveries(bystander.id);
        expect(deliveries, 'delivery observability is available').toBeTruthy();
        expect(
            deliveries.some((row) => row.messageId === followup.message.id),
            'unrelated Agent received the follow-up'
        ).toBe(false);
        const nextTask = await taskFor(kit, followup.message.id);
        expect(nextTask?.assigneeAgentId, 'new request owner').toBe(worker.id);
        expect(nextTask?.status, 'explicitly completed follow-up').toBe('done');
        expect((await taskFor(kit, request.message.id))?.status, 'root remains complete').toBe(
            'done'
        );
        const history = await kit.trpc('chat.messages', {
            chatId: channel.id,
            serverId: kit.serverId,
            limit: 100,
        });
        expect(
            history.threads.reduce((count, thread) => count + thread.replyCount, 0),
            'ordinary requests did not create thread discussions'
        ).toBe(0);
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

async function taskFor(kit, messageId) {
    const { tasks } = await kit.trpc('task.list', {
        serverId: kit.serverId,
        includeBackground: true,
    });
    return tasks.find((entry) => entry.task.messageId === messageId)?.task;
}

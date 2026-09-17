import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Natural answers and planning updates link to their channel request; a human Thread follow-up receives its revision in that Thread.',
    name: 'conversation-natural-followups',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        log('asking a basic question');
        const basicRequest = await kit.harness.send(
            channel.id,
            `@${worker.handle} We sold 17 shirts at $23 each today. How much revenue is that?`
        );
        const basic = await settleTurn(worker.id);
        const answers = await basic.authoredMessagesIn(channel.id);
        log(`basic answer: ${answers.length} channel messages`);

        log('asking for a more involved plan');
        const planningRequest = await kit.harness.send(
            channel.id,
            `@${worker.handle} Help me plan a Bluebird launch for independent bookstores. We have $2,000 and two weeks, and Maya can spend ten hours on it. Compare a webinar with a sample-mailing campaign, recommend one, and lay out the schedule and tradeoffs.`
        );
        const planning = await settleTurn(worker.id);
        const plans = await planning.authoredMessagesIn(channel.id);
        log(`plan: ${plans.length} channel messages`);
        const beforeFollowup = await kit.trpc('chat.messages', {
            chatId: channel.id,
            serverId: kit.serverId,
            limit: 100,
        });
        const automaticReplies = beforeFollowup.threads.reduce(
            (total, thread) => total + thread.replyCount,
            0
        );
        const anchor = plans.at(-1) ?? (await kit.readMessages(channel.id)).at(-1);
        const parentHead = await kit.readHead(channel.id);

        log('human follows up using the reply thread');
        const reply = await kit.sendInThread(
            channel.id,
            anchor.id,
            `@${worker.handle} Change of plans: our budget is now $800 and Maya is unavailable. Jules has six hours. How would you revise this?`
        );
        const revision = await settleTurn(worker.id);
        const replies = await revision.authoredMessagesIn(reply.threadChatId);
        const { tasks } = await kit.trpc('task.list', {
            serverId: kit.serverId,
            includeBackground: true,
        });
        for (const { task } of tasks.filter((entry) => entry.task.chatId === channel.id)) {
            await kit.trackChat(task.threadChatId);
            await kit.readMessages(task.threadChatId);
        }
        expect(replies.length > 0, 'revision in human thread').toBe(true);
        expect(
            replies.some((message) => message.content.includes('800')),
            'revision uses new budget'
        ).toBe(true);
        expect(
            kit.authoredBy(await kit.readMessages(channel.id), worker.id, parentHead),
            'parent stays quiet after human moves into thread'
        ).toHaveLength(0);
        for (const turn of [basic, planning, revision]) {
            expect(turn.status, 'turn completed').toBe('completed');
        }
        expect(plans.length > 0, 'planning response in channel').toBe(true);
        expect(
            answers.every((message) => message.reply?.rootMessageId === basicRequest.message.id),
            'basic responses link to the request'
        ).toBe(true);
        expect(
            plans.every((message) => message.reply?.rootMessageId === planningRequest.message.id),
            'planning acknowledgments and outcome link to the request'
        ).toBe(true);
        expect(automaticReplies, 'no side replies before human opens a thread').toBe(0);
        expect(
            answers.some((message) => message.content.includes('391')),
            'basic answer in channel'
        ).toBe(true);
    }),
});

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { expectSettled, postsAcross, tasksCreatedBy } from '../task-intake.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A quick factual question in a channel gets one inline reply carrying the answer and no Task.',
    name: 'task-intake-quick-fact-replies',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const head = await kit.readHead(channel.id);

        log('asking the quick question');
        const question = await kit.harness.send(
            channel.id,
            `@${worker.handle} quick one: which HTTP status code means Too Many Requests?`
        );
        const turn = await settleTurn(worker.id);
        expectSettled(expect, turn, 'turn');

        log('checking gates');
        const posts = await postsAcross(kit, channel.id, worker.id, head);
        expect(posts, 'Agent posts in the channel').toHaveLength(1);
        const [answer] = posts;
        expect(answer.reply?.rootMessageId, 'the answer is an inline reply to the question').toBe(
            question.message.id
        );
        expect(answer.content, 'the answer carries the status code').toContain('429');
        expect(await tasksCreatedBy(kit, worker.id, turn), 'Tasks the Agent created').toHaveLength(
            0
        );
    }),
});

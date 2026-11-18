import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { cancelTasksBy, expectSettled, postsAcross, tasksCreatedBy } from '../task-intake.mjs';
import { armWorkflowTrigger } from '../task-intake-events.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A Trigger fire that only needs acknowledging gets exactly one top-level post in the Trigger channel attributed to the fire, nothing else, and no Task.',
    name: 'task-intake-trigger-acknowledge',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const workflow = `Nightly Build ${marker('').slice(0, 4)}`;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const armed = await armWorkflowTrigger(kit, {
            channel,
            conclusion: 'success',
            instruction: 'Let the channel know the nightly build passed, in one line.',
            title: 'Nightly build passed on main in acme/api',
            worker,
        });

        try {
            const head = await kit.readHead(channel.id);
            log(`posting a passing ${workflow} run`);
            const { delivery, fireId, turn } = await armed.fire(settleTurn, workflow);
            expect(delivery.status, 'webhook delivery status').toBe(202);
            expect(fireId, 'the Trigger fired').toBeTruthy();
            expectSettled(expect, turn, 'fire turn');

            log('checking gates');
            const posts = await postsAcross(kit, channel.id, worker.id, head);
            expect(posts, 'Agent posts in the channel').toHaveLength(1);
            const [post] = posts;
            expect(post.reply ?? null, 'the acknowledgment is top level').toBe(null);
            expect(post.cause?.fireId, 'the acknowledgment names the fire').toBe(fireId);
            expect(
                await tasksCreatedBy(kit, worker.id, turn.startedAt),
                'Tasks the Agent created'
            ).toHaveLength(0);
        } finally {
            await armed.cleanup();
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

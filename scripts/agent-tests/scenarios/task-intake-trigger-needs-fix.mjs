import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { armWorkflowTrigger } from '../task-intake-events.mjs';
import {
    cancelTasksBy,
    channelFootprint,
    expectSettled,
    expectShortFootprint,
    originMessage,
    postsAcross,
    tasksCreatedBy,
} from '../task-intake.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A CI-failure Trigger fire that needs a fix becomes exactly one Task started from a top-level Agent message in the Trigger channel attributed to the fire; besides that origin the channel carries at most one brief reference to the Task.',
    name: 'task-intake-trigger-needs-fix',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const workflow = `Release Gate ${marker('').slice(0, 4)}`;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const armed = await armWorkflowTrigger(kit, {
            channel,
            conclusion: 'failure',
            instruction:
                'CI failed on main. Find out why and get main green again; the release waits on it.',
            title: 'CI failed on main',
            worker,
        });

        try {
            const head = await kit.readHead(channel.id);
            log(`posting a failed ${workflow} run`);
            const { delivery, fireId, turn } = await armed.fire(settleTurn, workflow);
            expect(delivery.status, 'webhook delivery status').toBe(202);
            expect(fireId, 'the Trigger fired').toBeTruthy();
            expectSettled(expect, turn, 'fire turn');

            log('checking gates');
            const tasks = await tasksCreatedBy(kit, worker.id, turn);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            const origin = await originMessage(kit, tasks[0], {
                agentId: worker.id,
                chatId: channel.id,
            });
            expect(Boolean(origin), "the Task's origin is an Agent message in the channel").toBe(
                true
            );
            expect(origin.reply ?? null, 'the origin is a top-level message').toBe(null);
            expect(origin.cause?.fireId, 'the origin names the fire').toBe(fireId);
            expect(origin.cause?.attribution, 'the fire named with --cause').toBe('explicit');

            const topLevel = (await postsAcross(kit, channel.id, worker.id, head)).filter(
                (message) => message.chatId === channel.id
            );
            expectShortFootprint(
                expect,
                channelFootprint(
                    topLevel.filter((message) => message.id !== origin.id),
                    tasks[0]
                ),
                { acknowledgments: 0 }
            );
        } finally {
            await armed.cleanup();
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

import { claimsCreatedBy, fireStatusCheck } from '../fire-claims.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { cancelReminder } from '../task-intake-events.mjs';
import { cancelTasksBy, expectSettled, postsAcross, tasksCreatedBy } from '../task-intake.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A Reminder check that finds a red build is answered with exactly one top-level post in the anchor channel caused by the fire and carrying the build token, with no claim and no Task.',
    name: 'reminder-fire-acts-no-claim',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const token = marker('RED');
        const fired = await fireStatusCheck(kit, {
            boardLine: `build ${token} is red, the deploy job failed.`,
            settleTurn,
            worker,
        });
        try {
            expectSettled(expect, fired.turn, 'fire turn');
            expect(fired.fireId, 'the reminder fired').toBeTruthy();

            log('checking gates');
            expect(
                (await claimsCreatedBy(kit, worker.id)).length - fired.claimsBefore,
                'claims the Agent created on the fire'
            ).toBe(0);
            const posts = await postsAcross(kit, fired.channel.id, worker.id, fired.head);
            expect(posts, 'Agent posts in the anchor channel').toHaveLength(1);
            const [post] = posts;
            expect(post.reply ?? null, 'the alert is posted top level').toBe(null);
            expect(post.cause?.kind, 'the post is caused by the reminder').toBe('reminder');
            expect(post.content, 'the post names the red build').toContain(token);
            expect(
                await tasksCreatedBy(kit, worker.id, fired.turn),
                'Tasks the Agent created'
            ).toHaveLength(0);
        } finally {
            await cancelReminder(kit, fired.reminder, worker.id);
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

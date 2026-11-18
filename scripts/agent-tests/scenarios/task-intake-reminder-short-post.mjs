import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import {
    cancelTasksBy,
    expectSettled,
    postsAcross,
    settleIfStarted,
    tasksCreatedBy,
} from '../task-intake.mjs';
import { cancelReminder, fireReminderNow, scheduleAgentReminder } from '../task-intake-events.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A Reminder whose job is a short status post is answered with exactly one top-level post in the anchor channel caused by the fire, nothing else, and no Task.',
    name: 'task-intake-reminder-short-post',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const token = marker('GREEN');
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let reminder = null;

        try {
            log('seeding the status line');
            const anchor = await kit.harness.send(
                channel.id,
                `FYI, no reply needed. Status board ${kit.stamp}: build ${token}, 2 PRs waiting on review.`
            );
            await settleIfStarted(settleTurn, worker.id);
            reminder = await scheduleAgentReminder(kit, {
                agentId: worker.id,
                chatId: channel.id,
                description:
                    'Post a one-line morning status for the team from the latest status board line in this channel.',
                messageId: anchor.message.id,
                title: 'Morning status post',
            });
            const head = await kit.readHead(channel.id);

            log('firing the reminder');
            const { fireId, turn } = await fireReminderNow(kit, {
                agentId: worker.id,
                reminder,
                settleTurn,
            });
            expectSettled(expect, turn, 'fire turn');
            expect(fireId, 'the reminder fired').toBeTruthy();

            log('checking gates');
            const posts = await postsAcross(kit, channel.id, worker.id, head);
            expect(posts, 'Agent posts in the channel').toHaveLength(1);
            const [post] = posts;
            expect(post.reply ?? null, 'the status is posted top level in the channel').toBe(null);
            expect(post.cause?.kind, 'the post is caused by the reminder').toBe('reminder');
            expect(post.cause?.automationId, 'the causing reminder').toBe(reminder.id);
            expect(post.content, 'the post carries the status').toContain(token);
            expect(
                await tasksCreatedBy(kit, worker.id, turn.startedAt),
                'Tasks the Agent created'
            ).toHaveLength(0);
        } finally {
            await cancelReminder(kit, reminder, worker.id);
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

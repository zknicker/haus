// Task intake 6: a Reminder fires that starts real multi-step work (a re-review that ends in
// a decision). The reply will not be the whole of the work, so the Agent starts a Task whose
// origin is its own top-level message in the Reminder's channel, attributed to the fire, then
// works and reports in the Task. The work is a sealed relay, so it is several steps by
// construction.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import {
    cancelTasksBy,
    expectSettled,
    originMessage,
    postsAcross,
    relayPuzzle,
    resultCopies,
    settleIfStarted,
    taskPosts,
    tasksCreatedBy,
} from '../task-intake.mjs';
import { cancelReminder, fireReminderNow, scheduleAgentReminder } from '../task-intake-events.mjs';

const puzzle = relayPuzzle({ divisor: 9, limit: 450, modulus: 83 });

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A Reminder that starts multi-step work becomes exactly one Task started from a top-level Agent message in the anchor channel caused by the fire, and the result is reported in the Task, with no copy of it in the channel.',
    name: 'task-intake-reminder-starts-work',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const token = marker('CHECK');
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let reminder = null;

        try {
            const anchor = await kit.harness.send(
                channel.id,
                `FYI, no reply needed. Release checklist ${kit.stamp} goes out Friday.`
            );
            await settleIfStarted(settleTurn, worker.id);
            reminder = await scheduleAgentReminder(kit, {
                agentId: worker.id,
                chatId: channel.id,
                description: `Re-run the release checklist and clear the release if it passes. The checklist is a four-step relay, each step sealed in the one before; start with \`${puzzle.command}\` and report the final number with the marker ${token}.`,
                messageId: anchor.message.id,
                title: 'Re-run the release checklist',
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
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            log('checking gates');
            const tasks = await tasksCreatedBy(kit, worker.id, turn.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            const [task] = tasks;
            const origin = await originMessage(kit, task, {
                agentId: worker.id,
                chatId: channel.id,
            });
            expect(Boolean(origin), "the Task's origin is an Agent message in the channel").toBe(
                true
            );
            expect(origin.reply ?? null, 'the origin is a top-level message').toBe(null);
            expect(origin.cause?.kind, 'the origin is caused by the reminder').toBe('reminder');
            expect(origin.cause?.automationId, 'the causing reminder').toBe(reminder.id);

            const results = (await taskPosts(kit, task, worker.id)).filter((message) =>
                message.content.includes(token)
            );
            expect(results.length >= 1, 'the result is reported in the Task').toBe(true);
            expect(
                results.some((message) => message.content.includes(puzzle.answer)),
                `a result post in the Task carries the computed ${puzzle.answer}`
            ).toBe(true);
            const posts = await postsAcross(kit, channel.id, worker.id, head);
            expect(
                posts.filter((message) => message.id !== origin.id),
                'channel posts besides the origin'
            ).toHaveLength(0);
            expect(
                resultCopies(posts, task, puzzle.answer),
                'channel posts, the origin included, repeating the result the Task reports'
            ).toHaveLength(0);
        } finally {
            await cancelReminder(kit, reminder, worker.id);
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

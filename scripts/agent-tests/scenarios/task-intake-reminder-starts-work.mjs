import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { cancelReminder, fireReminderNow, scheduleAgentReminder } from '../task-intake-events.mjs';
import {
    cancelTasksBy,
    channelFootprint,
    expectSettled,
    expectShortFootprint,
    originMessage,
    postsAcross,
    relayPuzzle,
    resultCopies,
    settleIfStarted,
    taskPosts,
    tasksCreatedBy,
} from '../task-intake.mjs';

const puzzle = relayPuzzle({ divisor: 9, limit: 450, modulus: 83 });

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A Reminder whose work waits on input that arrives after the fire becomes exactly one Task started from a top-level Agent message in the anchor channel caused by the fire; once the input arrives in the Task the result is reported there, and the channel carries at most one brief reference to the Task and no copy of the result.',
    name: 'task-intake-reminder-starts-work',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const token = marker('CHECK');
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let reminder = null;

        try {
            const anchor = await kit.harness.send(
                channel.id,
                `FYI, no reply needed now. Release checklist ${kit.stamp} gets re-run against each release build when its reminder fires.`
            );
            await settleIfStarted(settleTurn, worker.id);
            reminder = await scheduleAgentReminder(kit, {
                agentId: worker.id,
                chatId: channel.id,
                description: `Re-run release checklist ${kit.stamp} against the new release build and clear the release if it passes. The build is still being cut when this fires; the release lead posts the command that unpacks it as soon as it lands. Report the final number with the marker ${token}.`,
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

            const tasks = await tasksCreatedBy(kit, worker.id, turn.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            const [task] = tasks;

            log('the build lands: posting it in the Task');
            await kit.trackChat(task.chatId);
            await kit.harness.send(
                task.chatId,
                `@${worker.handle} the release build landed. The checklist against it is a four-step relay, each step sealed in the one before; start with \`${puzzle.command}\``
            );
            expectSettled(expect, await settleTurn(worker.id), 'build turn');
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            log('checking gates');
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
            const posts = (await postsAcross(kit, channel.id, worker.id, head)).filter(
                (message) => message.chatId === channel.id
            );
            expect(
                resultCopies(posts, task, puzzle.answer),
                'channel posts, the origin included, repeating the result the Task reports'
            ).toHaveLength(0);
            expectShortFootprint(
                expect,
                channelFootprint(
                    posts.filter((message) => message.id !== origin.id),
                    task
                ),
                { acknowledgments: 0 }
            );
        } finally {
            await cancelReminder(kit, reminder, worker.id);
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

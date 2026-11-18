// Task intake 3: investigate-and-fix work that takes several steps. The reply will not be the
// whole of the work, so the Agent starts a Task from the request, says so briefly in one inline
// reply that references the Task, and reports the work in the Task. The work is a sealed relay,
// so it is several steps by construction. The channel already previews the Task, so no channel
// post repeats the result.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import {
    cancelTasksBy,
    expectSettled,
    originMessage,
    postsAcross,
    referencesTask,
    relayPuzzle,
    resultCopies,
    taskPosts,
    tasksCreatedBy,
} from '../task-intake.mjs';

const puzzle = relayPuzzle({ divisor: 7, limit: 400, modulus: 97 });

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Multi-step investigate-and-fix work asked in a channel becomes exactly one Task started from a message in that channel, answered by one brief inline reply that references it, with the result reported in the Task, no further top-level posts in the channel, and no copy of the result there.',
    name: 'task-intake-multi-step-opens-task',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const token = marker('RELAY');
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        const head = await kit.readHead(channel.id);

        try {
            log('asking for the multi-step investigation');
            const request = await kit.harness.send(
                channel.id,
                `@${worker.handle} the nightly reconciliation number looks wrong. Can you investigate and fix it? The check is a four-step relay, each step sealed in the one before; start with \`${puzzle.command}\` and report the final number with the marker ${token}.`
            );
            const turn = await settleTurn(worker.id);
            expectSettled(expect, turn, 'turn');

            log('checking gates');
            const tasks = await tasksCreatedBy(kit, worker.id, turn.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            const [task] = tasks;

            const origin = await originMessage(kit, task, { agentId: null, chatId: channel.id });
            expect(Boolean(origin), 'the Task starts from a message in the channel').toBe(true);

            const posts = await postsAcross(kit, channel.id, worker.id, head);
            const topLevel = posts.filter((message) => message.chatId === channel.id);
            const pointers = topLevel.filter(
                (message) =>
                    message.reply?.rootMessageId === request.message.id &&
                    referencesTask(message, task)
            );
            expect(pointers, 'one inline reply to the request names the Task').toHaveLength(1);
            expect(
                pointers[0].content.trim().includes('\n'),
                'the inline reply is one brief line'
            ).toBe(false);
            expect(
                topLevel.filter(
                    (message) => message.id !== pointers[0].id && message.id !== origin.id
                ),
                'top-level channel posts besides the origin and the pointer'
            ).toHaveLength(0);
            expect(
                resultCopies(topLevel, task, puzzle.answer),
                'channel posts repeating the result the Task reports'
            ).toHaveLength(0);

            const inTask = await taskPosts(kit, task, worker.id);
            expect(
                inTask.some((message) => message.content.includes(puzzle.answer)),
                'the result is reported in the Task'
            ).toBe(true);
        } finally {
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

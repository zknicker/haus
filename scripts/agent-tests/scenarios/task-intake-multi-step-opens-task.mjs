import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import {
    cancelTasksBy,
    channelFootprint,
    expectSettled,
    expectShortFootprint,
    originMessage,
    postsAcross,
    relayPuzzle,
    taskPosts,
    tasksCreatedBy,
} from '../task-intake.mjs';

const puzzle = relayPuzzle({ divisor: 7, limit: 400, modulus: 97 });

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Investigate-and-fix work asked in a channel that cannot finish in the reply, because its input arrives later, becomes exactly one Task started from a message in that channel; the channel carries at most a one-line acknowledgment plus one brief inline reply that references the Task, and once the input arrives in the Task the result is reported there, with no copy of it in the channel.',
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
                `@${worker.handle} the nightly reconciliation number looks wrong. Can you investigate and fix it? The check runs against tonight's ledger export, which is still being generated; I'll send you the command that unpacks it as soon as it lands. Report the final number with the marker ${token}.`
            );
            const turn = await settleTurn(worker.id);
            expectSettled(expect, turn, 'turn');
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            const tasks = await tasksCreatedBy(kit, worker.id, turn.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            const [task] = tasks;

            log('the export lands: posting it in the Task');
            await kit.trackChat(task.chatId);
            await kit.harness.send(
                task.chatId,
                `@${worker.handle} the export landed. It is a four-step relay, each step sealed in the one before; start with \`${puzzle.command}\``
            );
            expectSettled(expect, await settleTurn(worker.id), 'export turn');
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            log('checking gates');
            const origin = await originMessage(kit, task, { agentId: null, chatId: channel.id });
            expect(Boolean(origin), 'the Task starts from a message in the channel').toBe(true);

            const posts = await postsAcross(kit, channel.id, worker.id, head);
            const topLevel = posts.filter((message) => message.chatId === channel.id);
            const footprint = channelFootprint(topLevel, task, { answer: puzzle.answer });
            expectShortFootprint(expect, footprint, { references: [1, 1] });
            expect(
                footprint.references.some(
                    (message) => message.reply?.rootMessageId === request.message.id
                ),
                'the Task reference is an inline reply to the request'
            ).toBe(true);

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

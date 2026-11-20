import { humanAuthorId, mentionsHuman } from '../human-addressing.mjs';
import { wait } from '../room-c.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import {
    attachedWork,
    cancelTasksBy,
    expectSettled,
    originMessage,
    postsAcross,
    readTaskDetail,
    taskPosts,
    tasksCreatedBy,
} from '../task-intake.mjs';

const settled = new Set(['done', 'needs-you', 'failed', 'stopped']);

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'When a Worker attached to a Task finishes, the Agent reports in that Task where the requester is notified (an @mention, the Task started from their message, or they follow it) and posts nothing in the channel.',
    name: 'task-intake-cloud-finish-reports-in-task',
    optIn: true,
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let task = null;
        try {
            const request = await kit.harness.send(
                channel.id,
                `@${worker.handle} Can you have a Worker read the README in zknicker/haus on main and summarize what the project does in three bullets? Review only, no code changes or PR.`
            );
            const requester = humanAuthorId(request.message);
            const launch = await settleTurn(worker.id);
            expectSettled(expect, launch, 'launch turn');
            const tasks = await tasksCreatedBy(kit, worker.id, launch.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            [task] = tasks;
            const origin = await originMessage(kit, task, { agentId: null, chatId: channel.id });
            expect(Boolean(origin), 'the Task starts from a message in the channel').toBe(true);

            log('waiting for the Worker to finish');
            const work = await awaitTerminalWork(kit, task, 20 * 60_000);
            expect(work?.status, 'the Worker finished').toBe('done');
            await kit.harness.waitForAgentQuiet(worker.id, 15_000, 600_000);

            log('checking gates');
            const settledAt = Date.parse(work.terminalAt);
            const inTask = (await taskPosts(kit, task, worker.id)).filter(
                (message) => Date.parse(message.createdAt) >= settledAt
            );
            expect(inTask.length >= 1, 'the Agent reports in the Task').toBe(true);
            const mentioned = inTask.some((message) => mentionsHuman(message.content, requester));
            const wroteOrigin =
                origin?.author?.kind === 'human' && origin.author.userId === requester;
            const { followed } = await readTaskDetail(kit, task);
            log(`requester mentioned=${mentioned} wroteOrigin=${wroteOrigin} follows=${followed}`);
            expect(
                mentioned || wroteOrigin || followed === true,
                'the requester is notified of the report or follows the Task'
            ).toBe(true);
            expect(
                (await postsAcross(kit, channel.id, worker.id)).filter(
                    (message) => Date.parse(message.createdAt) >= settledAt
                ),
                'channel posts after the Worker finished'
            ).toHaveLength(0);
        } finally {
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

async function awaitTerminalWork(kit, task, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const [work] = await attachedWork(kit, task);
        if ((work && settled.has(work.status)) || Date.now() >= deadline) {
            return work ?? null;
        }
        await wait(10_000);
    }
}

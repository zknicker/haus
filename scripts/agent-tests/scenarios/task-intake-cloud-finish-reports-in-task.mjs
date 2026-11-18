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
    taskPosts,
    tasksCreatedBy,
} from '../task-intake.mjs';

const terminal = new Set(['completed', 'failed', 'cancelled']);

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'When a cloud agent attached to a Task finishes, the Agent reports in that Task with an @mention of the requester and posts nothing in the channel.',
    name: 'task-intake-cloud-finish-reports-in-task',
    optIn: true,
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let task = null;
        try {
            const request = await kit.harness.send(
                channel.id,
                `@${worker.handle} Can you have a cloud agent read the README in zknicker/haus on main and summarize what the project does in three bullets? Review only, no code changes or PR.`
            );
            const requester = humanAuthorId(request.message);
            const launch = await settleTurn(worker.id);
            expectSettled(expect, launch, 'launch turn');
            const tasks = await tasksCreatedBy(kit, worker.id, launch.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            [task] = tasks;
            const origin = await originMessage(kit, task, { agentId: null, chatId: channel.id });
            expect(Boolean(origin), 'the Task starts from a message in the channel').toBe(true);

            log('waiting for the cloud agent to finish');
            const work = await awaitTerminalWork(kit, task, 20 * 60_000);
            expect(work?.status, 'the cloud agent finished').toBe('completed');
            await kit.harness.waitForAgentQuiet(worker.id, 15_000, 600_000);

            log('checking gates');
            const settledAt = Date.parse(work.terminalAt);
            const inTask = (await taskPosts(kit, task, worker.id)).filter(
                (message) => Date.parse(message.createdAt) >= settledAt
            );
            expect(inTask.length >= 1, 'the Agent reports in the Task').toBe(true);
            expect(
                inTask.some((message) => mentionsHuman(message.content, requester)),
                'the report @mentions the requester'
            ).toBe(true);
            expect(
                (await postsAcross(kit, channel.id, worker.id)).filter(
                    (message) => Date.parse(message.createdAt) >= settledAt
                ),
                'channel posts after the cloud agent finished'
            ).toHaveLength(0);
        } finally {
            const works = task ? await attachedWork(kit, task).catch(() => []) : [];
            for (const entry of works) {
                if (!terminal.has(entry.status)) {
                    await kit
                        .trpc('cloudAgentWork.cancel', { serverId: kit.serverId, workId: entry.id })
                        .catch(() => undefined);
                }
            }
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

async function awaitTerminalWork(kit, task, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const [work] = await attachedWork(kit, task);
        if ((work && terminal.has(work.status)) || Date.now() >= deadline) {
            return work ?? null;
        }
        await wait(10_000);
    }
}

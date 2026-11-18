// Task intake 4: coding work that needs a cloud agent. A cloud agent always means the reply
// will not finish the work, so the Agent starts the Task first and then launches the cloud
// agent on it (`haus cloud-agent start --task`); the CLI refuses a launch without one. The
// work's link to its Task is the Task's `attachedWork` (the work's `task_id`). Opt-in: it
// launches a real Cursor run, so the stack needs Cursor access to zknicker/haus (see
// cloud-launch-and-link).

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import {
    attachedWork,
    cancelTasksBy,
    expectSettled,
    originMessage,
    tasksCreatedBy,
} from '../task-intake.mjs';

const terminal = new Set(['completed', 'failed', 'cancelled']);

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Coding work that needs a cloud agent gets exactly one Task, started from a message in the channel, with exactly one cloud agent attached to it.',
    name: 'task-intake-cloud-launch-on-task',
    optIn: true,
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let works = [];
        try {
            await kit.harness.send(
                channel.id,
                `@${worker.handle} Can you get a cloud agent to tighten the getting-started section of the README in zknicker/haus on main and open a draft PR?`
            );
            const turn = await settleTurn(worker.id);
            expectSettled(expect, turn, 'launch turn');

            log('checking gates');
            const tasks = await tasksCreatedBy(kit, worker.id, turn.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            const [task] = tasks;
            const origin = await originMessage(kit, task, { agentId: null, chatId: channel.id });
            expect(Boolean(origin), 'the Task starts from a message in the channel').toBe(true);
            works = await attachedWork(kit, task);
            expect(works, 'cloud agent work attached to the Task').toHaveLength(1);
        } finally {
            for (const work of works) {
                if (!terminal.has(work.status)) {
                    await kit
                        .trpc('cloudAgentWork.cancel', { serverId: kit.serverId, workId: work.id })
                        .catch(() => undefined);
                }
            }
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

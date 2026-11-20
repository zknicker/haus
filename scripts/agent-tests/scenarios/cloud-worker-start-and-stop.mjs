import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import {
    attachedWork,
    cancelTasksBy,
    expectSettled,
    originMessage,
    tasksCreatedBy,
} from '../task-intake.mjs';

const live = new Set(['queued', 'working']);

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A natural cloud review request starts exactly one Task from a message in the requesting channel with exactly one Worker attached to it, and a person can stop that Worker by its id.',
    name: 'cloud-worker-start-and-stop',
    optIn: true,
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        try {
            await kit.harness.send(
                channel.id,
                `@${worker.handle} Can you have a Worker take a quick look at the README in zknicker/haus on main and tell me what the project does and whether the getting-started instructions seem clear? Just a review; no code changes or PR needed.`
            );
            const launch = await settleTurn(worker.id);
            expectSettled(expect, launch, 'launch turn');
            const tasks = await tasksCreatedBy(kit, worker.id, launch.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            const [task] = tasks;
            const origin = await originMessage(kit, task, { agentId: null, chatId: channel.id });
            expect(Boolean(origin), 'the Task starts from a message in the channel').toBe(true);
            const workers = await attachedWork(kit, task);
            expect(workers, 'Worker attached to the Task').toHaveLength(1);
            const [started] = workers;
            log(`Worker ${started.id} on ${started.place}: ${started.status}`);
            if (!live.has(started.status)) {
                log('the Worker settled before the stop; the stop gate is skipped');
                return;
            }

            const { worker: stopped } = await kit.trpc('worker.stop', {
                serverId: kit.serverId,
                workerId: started.id,
            });
            expect(stopped.id, 'the stop answers with the same Worker').toBe(started.id);
            expect(
                stopped.turns[0]?.stopRequestedBy?.kind,
                'the newest turn records the person who stopped it'
            ).toBe('user');
        } finally {
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

// A natural cloud review request starts one Task from a message in the requesting channel and
// launches exactly one real cloud agent on it (ADR 0053 decision 6: cloud work attaches to a
// Task, and the CLI refuses a launch without one). The work is then cancelled; the provider
// round trip and the completion wake are Server plumbing, not judgment. Asked from a second
// channel, the Agent links the same work there (ADR 0044): its Message carries the printed
// link and gets the live card, and the work stays attached to its Task.
//
// Opt-in: it launches a real Cursor run, so the stack needs Cursor access.

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
        'A natural cloud review request starts exactly one Task from a message in the requesting channel with exactly one cloud agent attached, and asked from a second channel the Agent links that same work with its live card while it stays attached to the Task.',
    name: 'cloud-launch-and-link',
    optIn: true,
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let works = [];
        try {
            await kit.harness.send(
                channel.id,
                `@${worker.handle} Can you have a cloud agent take a quick look at the README in zknicker/haus on main and tell me what the project does and whether the getting-started instructions seem clear? Just a review; no code changes or PR needed.`
            );
            const launch = await settleTurn(worker.id);
            expectSettled(expect, launch, 'launch turn');
            const tasks = await tasksCreatedBy(kit, worker.id, launch.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            const [task] = tasks;
            const origin = await originMessage(kit, task, { agentId: null, chatId: channel.id });
            expect(Boolean(origin), 'the Task starts from a message in the channel').toBe(true);
            works = await attachedWork(kit, task);
            expect(works, 'cloud agent work attached to the Task').toHaveLength(1);
            const [work] = works;
            log(`cloud work ${work.id}: ${work.status}`);

            await cancelUnfinished(kit, works, log);

            const second = await kit.createChannel({ agentIds: [worker.id] });
            await kit.harness.send(
                second.id,
                `@${worker.handle} Can you link the cloud agent work you started on the zknicker/haus README here, so this team can follow it?`
            );
            const linkTurn = await settleTurn(worker.id, { startWithin: 90_000 });
            expectSettled(expect, linkTurn, 'link turn');
            const linking = (await kit.readMessages(second.id)).filter(
                (message) =>
                    message.author.agentId === worker.id &&
                    message.content.includes(`cloud-agent://${work.id}`)
            );
            expect(linking.length > 0, 'second channel message links the work').toBe(true);
            expect(
                linking.some((message) =>
                    (message.cloudAgentWork ?? []).some((linked) => linked.id === work.id)
                ),
                'linked work renders its card in the second channel'
            ).toBe(true);
            const attached = await attachedWork(kit, task);
            expect(attached, 'cloud agent work still attached to the Task').toHaveLength(1);
            expect(attached[0]?.id, 'the work stays attached to its Task').toBe(work.id);
        } finally {
            await cancelUnfinished(kit, works, log);
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

async function cancelUnfinished(kit, works, log) {
    for (const work of works.filter((entry) => !terminal.has(entry.status))) {
        await kit
            .trpc('cloudAgentWork.cancel', { serverId: kit.serverId, workId: work.id })
            .catch(() => undefined);
        log(`requested cancellation of cloud work ${work.id}`);
    }
}

// Task intake 9: mid-work, the Agent finds several separate issues that each need their own
// fix. It reports them in one message and starts one Task per issue from that message:
// siblings, never one umbrella Task. The request itself (go through the notes) is quick; each
// finding is real work outside the chat, so none finishes in the reply. Tasks have no parents,
// so the gate that bites is one Task per issue, all sharing one origin (ADR 0052 decision 3).

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { cancelTasksBy, expectSettled, originMessage, tasksCreatedBy } from '../task-intake.mjs';

const notes = [
    'Incident notes, week of the Bluebird launch:',
    '- Tue: the staging Stripe key was pasted in the #vendors channel; it has not been rotated.',
    '- Wed: the billing export silently drops customers whose names contain emoji; finance found 14 missing rows.',
    '- Thu: the status page TLS certificate renews by hand and expires in 9 days; nobody owns the renewal.',
].join('\n');

const issues = [
    /stripe|staging key|rotat/iu,
    /billing|export|emoji/iu,
    /status page|certificate|tls/iu,
];

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Three separate issues found while going through notes become three Tasks, one per issue, all started from one Agent message in the channel.',
    name: 'task-intake-findings-sibling-tasks',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });

        try {
            log('asking for the read-through');
            await kit.harness.send(
                channel.id,
                `@${worker.handle} can you go through this week's incident notes and handle whatever needs handling?\n\n${notes}`
            );
            const turn = await settleTurn(worker.id);
            expectSettled(expect, turn, 'turn');
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            log('checking gates');
            const tasks = await tasksCreatedBy(kit, worker.id, turn.startedAt);
            log(`Tasks: ${tasks.map((task) => `${task.key} ${task.title}`).join('; ') || 'none'}`);
            expect(tasks, 'Tasks the Agent created').toHaveLength(3);
            for (const [index, pattern] of issues.entries()) {
                expect(
                    tasks.filter((task) => pattern.test(`${task.title}\n${task.description}`)),
                    `Tasks covering issue ${index + 1}`
                ).toHaveLength(1);
            }

            const origins = new Set(tasks.map((task) => task.origin?.messageId ?? null));
            expect([...origins], 'every Task starts from the same message').toHaveLength(1);
            const origin = await originMessage(kit, tasks[0], {
                agentId: worker.id,
                chatId: channel.id,
            });
            expect(Boolean(origin), 'the shared origin is an Agent message in the channel').toBe(
                true
            );
        } finally {
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

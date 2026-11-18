// Three Tasks a person assigns to one Agent are a queue, not three requests: it works them one
// at a time, most urgent first, setting each `open` and then `done` while the rest wait in
// `todo` (ADR 0053, operator decision 2026-11-18). A lead Agent starts the Tasks in `todo` from
// the person's message with both Agents stopped; the person then assigns them to the worker, and
// only the worker is restarted, so one run carries all three assignments.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import {
    assignAsPerson,
    cancelTasks,
    journalTools,
    paceOf,
    startAgent,
    startTaskAsAgent,
    stateSteps,
    stopAgent,
} from '../task-pacing.mjs';

/** Oldest first, so age alone would pick the wrong one: priority has to decide. */
const queue = [
    { priority: 'low', word: 'amber' },
    { priority: 'medium', word: 'birch' },
    { priority: 'urgent', word: 'cedar' },
];

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'Three Tasks a person assigns at once are worked one at a time, most urgent first, each set open and then done, with never more than one of them open.',
    name: 'task-pacing-assigned-queue',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, lead] = agents;
        const token = marker('');
        const channel = await kit.createChannel({ agentIds: [worker.id, lead.id] });
        const tasks = [];

        try {
            await stopAgent(kit, worker.id);
            await stopAgent(kit, lead.id);
            try {
                log('starting three Tasks and assigning them to the worker');
                const origin = await kit.harness.send(
                    channel.id,
                    `Three markers to record for the Bluebird launch ${token}: amber, birch, and cedar.`
                );
                for (const { priority, word } of queue) {
                    const started = await startTaskAsAgent(kit, {
                        agentId: lead.id,
                        channel,
                        description: `Write the single line ${word}-${token} to a file named queue-${word}.txt in your workspace.`,
                        messageId: origin.message.id,
                        priority,
                        title: `Record the ${word} marker`,
                    });
                    tasks.push(started);
                    await assignAsPerson(kit, started, worker.id);
                }
            } finally {
                await startAgent(kit, worker.id);
            }

            const turn = await settleTurn(worker.id);
            expect(turn.status, 'turn status').toBe('completed');
            expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');

            log('checking gates');
            const [low, medium, urgent] = tasks.map((task) => task.key);
            const settled = await Promise.all(
                tasks.map((task) =>
                    kit.trpc('task.get', { serverId: kit.serverId, taskId: task.id })
                )
            );
            expect(
                settled.map((task) => `${task.key}:${task.state}`).join(' '),
                'every Task ended done'
            ).toBe([low, medium, urgent].map((key) => `${key}:done`).join(' '));

            const pace = paceOf(stateSteps(await journalTools(kit, worker.id, turn)), [
                low,
                medium,
                urgent,
            ]);
            log(`opened ${pace.opened.join(', ') || 'none'}; finished ${pace.finished.join(', ')}`);
            expect(pace.mostOpen, 'most assigned Tasks open at once').toBe(1);
            expect(pace.skippedOpen, 'Tasks finished without being set open').toHaveLength(0);
            expect(pace.opened.join(' '), 'Tasks opened by priority').toBe(
                [urgent, medium, low].join(' ')
            );
            expect(pace.finished.join(' '), 'Tasks finished by priority').toBe(
                [urgent, medium, low].join(' ')
            );
        } finally {
            await cancelTasks(kit, tasks);
            await startAgent(kit, lead.id);
        }
    }),
});

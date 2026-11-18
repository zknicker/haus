// Pacing is for Tasks others assign. Tasks an Agent starts itself, here one per failed check
// from one request, may run side by side (operator decision 2026-11-18): the Agent must not
// park its own siblings in `todo` to work them in sequence. Each check is a sealed relay, so it
// is several steps by construction and a reply will not finish it.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { cancelTasksBy, expectSettled, relayPuzzle, tasksCreatedBy } from '../task-intake.mjs';
import { journalTools, stateSteps } from '../task-pacing.mjs';

const checks = [
    { name: 'invoices', puzzle: relayPuzzle({ divisor: 11, limit: 440, modulus: 73 }) },
    { name: 'payouts', puzzle: relayPuzzle({ divisor: 17, limit: 510, modulus: 79 }) },
    { name: 'refunds', puzzle: relayPuzzle({ divisor: 19, limit: 570, modulus: 71 }) },
];

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Three separate multi-step checks asked in one message become three Tasks the Agent starts itself, and none is parked in todo to force them into sequence.',
    name: 'task-pacing-self-started-side-by-side',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const token = marker('CHECKS');
        const channel = await kit.createChannel({ agentIds: [worker.id] });

        try {
            log('asking for three separate checks');
            await kit.harness.send(
                channel.id,
                [
                    `@${worker.handle} three nightly reconciliation checks failed: invoices, payouts, and refunds. They are unrelated. Can you investigate and fix each? Each check is a four-step relay, each step sealed in the one before; report each final number with the marker ${token}.`,
                    ...checks.map(
                        ({ name, puzzle }) => `- ${name}: start with \`${puzzle.command}\``
                    ),
                ].join('\n')
            );
            const turn = await settleTurn(worker.id);
            expectSettled(expect, turn, 'turn');
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            log('checking gates');
            const tasks = await tasksCreatedBy(kit, worker.id, turn.startedAt);
            log(`Tasks: ${tasks.map((task) => `${task.key}:${task.state}`).join(', ') || 'none'}`);
            expect(tasks, 'Tasks the Agent started').toHaveLength(3);

            const keys = new Set(tasks.map((task) => task.key));
            const steps = stateSteps(await journalTools(kit, worker.id, turn));
            expect(
                steps.filter((step) => step.kind === 'start-todo'),
                'Tasks started parked in todo'
            ).toHaveLength(0);
            expect(
                steps.filter(
                    (step) => step.kind === 'state' && step.state === 'todo' && keys.has(step.key)
                ),
                'self-started Tasks set back to todo'
            ).toHaveLength(0);
            expect(
                tasks.filter((task) => task.state === 'todo').map((task) => task.key),
                'self-started Tasks left waiting in todo'
            ).toHaveLength(0);
        } finally {
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});

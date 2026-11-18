// A Task only a person can unblock does not hold up the queue: the Agent @mentions them in the
// Task, sets it back to `todo`, and takes the next Task a person assigned it. Nothing on the
// Task says it is blocked, so the Agent has to leave it there rather than pick it up again
// (ADR 0052; operator decision 2026-11-18). Seeded like task-pacing-assigned-queue: a lead
// Agent starts both Tasks in `todo` from the person's message, and the person assigns them.

import { mentionsHuman } from '../human-addressing.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { taskPosts } from '../task-intake.mjs';
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

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'Two Tasks a person assigns, and the more urgent one needs a decision only that person can make: the Agent @mentions them in that Task, leaves it in todo, works the other Task to done, and does not pick the blocked one up again.',
    name: 'task-pacing-blocked-takes-next',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, lead] = agents;
        const token = marker('');
        const channel = await kit.createChannel({ agentIds: [worker.id, lead.id] });
        const tasks = [];

        try {
            await stopAgent(kit, worker.id);
            await stopAgent(kit, lead.id);
            let blocked;
            let next;
            let userId;
            try {
                const origin = await kit.harness.send(
                    channel.id,
                    `Two things for the Bluebird private beta ${token}: pick the launch region, and record the amber marker.`
                );
                userId = origin.message.author.userId;
                const member = await kit.trpc('member.get', { serverId: kit.serverId, userId });
                if (!member?.handle) {
                    throw new Error(
                        'The evaluating human has no handle, so no Agent can @mention them.'
                    );
                }

                log('starting a Task the Agent can finish, then one only the human can decide');
                // Older than the blocked Task, so age alone would pick it: priority has to decide.
                next = await startTaskAsAgent(kit, {
                    agentId: lead.id,
                    channel,
                    description: `Write the single line amber-${token} to a file named queue-amber.txt in your workspace.`,
                    messageId: origin.message.id,
                    priority: 'low',
                    title: 'Record the amber marker',
                });
                tasks.push(next);
                blocked = await startTaskAsAgent(kit, {
                    agentId: lead.id,
                    channel,
                    description: [
                        `Decide whether the Bluebird private beta opens in the EU or the US first, then write the answer to launch-region-${token}.txt in your workspace.`,
                        `The call is @${member.handle}'s. It turns on a contract only they have seen, nothing in Haus or your workspace settles it, and a guess would be wrong.`,
                    ].join('\n\n'),
                    messageId: origin.message.id,
                    priority: 'urgent',
                    title: 'Pick the Bluebird launch region',
                });
                tasks.push(blocked);
                await assignAsPerson(kit, blocked, worker.id);
                await assignAsPerson(kit, next, worker.id);
            } finally {
                await startAgent(kit, worker.id);
            }

            const turn = await settleTurn(worker.id);
            expect(turn.status, 'turn status').toBe('completed');
            expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            log('checking gates');
            const questions = (await taskPosts(kit, blocked, worker.id)).filter((message) =>
                mentionsHuman(message.content, userId)
            );
            expect(
                questions.length >= 1,
                'the Agent @mentions the person in the blocked Task'
            ).toBe(true);

            const stateOf = async (task) =>
                (await kit.trpc('task.get', { serverId: kit.serverId, taskId: task.id })).state;
            expect(await stateOf(blocked), 'the blocked Task ended in todo').toBe('todo');
            expect(await stateOf(next), 'the other Task was worked to done').toBe('done');

            const pace = paceOf(stateSteps(await journalTools(kit, worker.id, turn)), [
                blocked.key,
                next.key,
            ]);
            log(`opened ${pace.opened.join(', ') || 'none'}; finished ${pace.finished.join(', ')}`);
            expect(pace.mostOpen <= 1, `assigned Tasks open at once (${pace.mostOpen})`).toBe(true);
            expect(pace.finished.join(' '), 'finishing changes read from the journal').toBe(
                next.key
            );
            expect(
                pace.timesOpened(blocked.key) <= 1,
                `the blocked Task was not picked up again (opened ${pace.opened.join(', ')})`
            ).toBe(true);
        } finally {
            await cancelTasks(kit, tasks);
            await startAgent(kit, lead.id);
        }
    }),
});

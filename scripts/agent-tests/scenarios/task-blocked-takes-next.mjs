// A Task only a person can unblock does not hold up the queue: the Agent @mentions them where
// the work lives, moves the card back to todo, and takes the next Task. Nothing on the card says
// it is blocked, so the done receipt still counts it, and the Agent has to stop there rather
// than pick it up again (ADR 0051 decisions 6 and 7).

import { awaitHumanAddressing, expectSettled } from '../room-b.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { archiveBoard, journalTools, paceOf, queueSteps } from '../task-queue.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Two Tasks assigned, and the more urgent one needs a decision only a person can make: the Agent @mentions that person about it where the work lives, leaves its card in todo, works the other Task to done, and stops though the receipt still counts the blocked card.',
    name: 'task-blocked-takes-next',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const { serverId } = kit;
        const token = marker('');
        const assignee = { agentId: worker.id, kind: 'agent' };
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        // The scenario's own board: passes and lanes never share a queue.
        const { board } = await kit.trpc('board.create', {
            key: `B${token.slice(0, 4)}`,
            name: `Blocked ${token}`,
            serverId,
        });

        try {
            // Older than the blocked Task, so age alone would pick it: priority has to decide.
            // Unassigned for now, because it also names the human the blocked Task depends on.
            const { task: next } = await kit.trpc('task.create', {
                boardId: board.id,
                description: `Write the single line amber-${token} to a file named queue-amber.txt in your workspace.`,
                priority: 'low',
                serverId,
                title: 'Record the amber marker',
            });
            const userId = next.createdBy.userId;
            const member = await kit.trpc('member.get', { serverId, userId });
            if (!member?.handle) {
                throw new Error(
                    'The evaluating human has no handle, so no Agent can @mention them.'
                );
            }

            log('assigning a Task only the human can decide, then one the Agent can finish');
            const { task: blocked } = await kit.trpc('task.create', {
                assignee,
                boardId: board.id,
                description: [
                    `Decide whether the Bluebird private beta opens in the EU or the US first, then write the answer to launch-region-${token}.txt in your workspace.`,
                    `The call is @${member.handle}'s. It turns on a contract only they have seen, nothing in Haus or your workspace settles it, and a guess would be wrong.`,
                    `This work lives in #${channel.name}.`,
                ].join('\n\n'),
                priority: 'urgent',
                serverId,
                title: 'Pick the Bluebird launch region',
            });
            await kit.trpc('task.assign', {
                assignee,
                expectedVersion: next.version,
                serverId,
                taskId: next.id,
            });

            const turn = await settleTurn(worker.id);
            expectSettled(expect, turn, 'queue turn');

            log('checking gates');
            const question = await awaitHumanAddressing(kit, {
                agentId: worker.id,
                channelId: channel.id,
                timeoutMs: 60_000,
                userId,
            });
            expect(question.reason, 'how the Agent addressed the human').toBe('mention');
            expect(question.message.content, 'the @mention names the blocked Task').toContain(
                blocked.key
            );

            const settled = await kit.trpc('task.list', { boardId: board.id, serverId });
            const categoryOf = (key) => settled.find((task) => task.key === key)?.category;
            expect(categoryOf(blocked.key), 'the blocked card ended in todo').toBe('todo');
            expect(categoryOf(next.key), 'the other Task was worked to done').toBe('done');

            const columns = new Map(
                board.columns.map((column) => [column.name.toLowerCase(), column.category])
            );
            const tools = await journalTools(kit, worker.id, turn);
            const pace = paceOf(queueSteps(tools, columns));

            expect(pace.mostActive, 'most cards active at once').toBe(1);
            expect(pace.finished.join(' '), 'finishing moves read from the journal').toBe(next.key);
            expect(pace.receipts[0], 'the done receipt still counts the blocked card').toContain(
                '1 more assigned to you in todo'
            );
            expect(
                pace.started.filter((key) => key === blocked.key).length <= 1,
                `the blocked card was not picked up again (started ${pace.started.join(', ')})`
            ).toBe(true);
        } finally {
            await archiveBoard(kit, board.id);
        }
    }),
});

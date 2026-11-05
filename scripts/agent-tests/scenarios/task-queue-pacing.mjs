// Three Tasks assigned to one Agent are a queue, not three requests: it works one card at a
// time by priority, moving each to active and then done, and the done receipt carries it to
// the next. Moving the card is the status update, so nobody hears about the pickup (ADR 0051
// decisions 6 and 7).

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { journalTools, paceOf, queueSteps } from '../task-queue.mjs';

/** Oldest first, so age alone would pick the wrong one: priority has to decide. */
const queue = [
    { priority: 'low', word: 'amber' },
    { priority: 'medium', word: 'birch' },
    { priority: 'urgent', word: 'cedar' },
];

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Three Tasks assigned at once are worked one at a time, most urgent first, each moved to an active column and then done, following the move receipt to the next, with no message sent before the last one finishes and at most one after.',
    name: 'task-queue-pacing',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const { serverId } = kit;
        const token = marker('');
        // The scenario's own board: passes and lanes never share a queue.
        const { board } = await kit.trpc('board.create', {
            key: `Q${token.slice(0, 4)}`,
            name: `Queue ${token}`,
            serverId,
        });

        try {
            log('assigning three Tasks');
            const tasks = [];
            for (const { priority, word } of queue) {
                const { task } = await kit.trpc('task.create', {
                    assignee: { agentId: worker.id, kind: 'agent' },
                    boardId: board.id,
                    description: `Write the single line ${word}-${token} to a file named queue-${word}.txt in your workspace.`,
                    priority,
                    serverId,
                    title: `Record the ${word} marker`,
                });
                tasks.push(task);
            }
            const [low, medium, urgent] = tasks.map((task) => task.key);

            const turn = await settleTurn(worker.id);
            expect(turn.status, 'turn status').toBe('completed');
            expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');

            log('checking gates');
            const settled = await kit.trpc('task.list', { boardId: board.id, serverId });
            expect(
                settled.map((task) => task.category),
                'every Task finished in a done column'
            ).toHaveLength(3);
            expect(
                settled.every((task) => task.category === 'done'),
                `every Task finished in a done column (got ${settled.map((task) => `${task.key}:${task.category}`).join(', ')})`
            ).toBe(true);

            const columns = new Map(
                board.columns.map((column) => [column.name.toLowerCase(), column.category])
            );
            const tools = await journalTools(kit, worker.id, turn);
            const pace = paceOf(queueSteps(tools, columns));

            expect(pace.mostActive, 'most cards active at once').toBe(1);
            expect(pace.skippedActive, 'Tasks finished without going active').toHaveLength(0);
            expect(pace.started.join(' '), 'Tasks started by priority').toBe(
                [urgent, medium, low].join(' ')
            );
            expect(pace.finished, 'finishing moves read from the journal').toHaveLength(3);
            expect(pace.receipts[0], 'the first done receipt names the rest').toContain(
                '2 more assigned to you in todo'
            );
            expect(pace.receipts[1], 'the second done receipt names the last').toContain(
                '1 more assigned to you in todo'
            );
            expect(
                pace.receipts[2]?.includes('more assigned to you') ?? false,
                'the last done receipt has no queue line'
            ).toBe(false);

            expect(pace.sendsBeforeLastFinish, 'messages sent before the queue ended').toBe(0);
            expect(pace.sends <= 1, `at most one closing message (got ${pace.sends})`).toBe(true);
        } finally {
            await archiveBoard(kit, board.id);
        }
    }),
});

/** Boards have no deletion; archiving keeps this one out of later lists and queue counts. */
async function archiveBoard(kit, boardId) {
    const { serverId } = kit;
    await kit
        .trpc('board.list', { serverId })
        .then(async (boards) => {
            const current = boards.find((candidate) => candidate.id === boardId);
            if (current) {
                await kit.trpc('board.update', {
                    boardId,
                    expectedVersion: current.version,
                    patch: { archived: true },
                    serverId,
                });
            }
        })
        .catch(() => undefined);
}

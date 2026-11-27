import { awaitQuiet, crewStartedBy, openCrewLedger, useAgentMachineForTasks } from '../crew.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An Issue assigned to a Captain wakes it to start exactly one crew Task, assigned that Issue, whose brief names the Issue code; the Issue stays todo or in_progress (only an edit moves it, so a done or canceled Issue was closed by hand), and the Captain posts in no channel.',
    name: 'captain-issue-starts-crew',
    run: withRoutingEvidence(async ({ agents, evidence, expect, kit, log, settleTurn }) => {
        const [captain] = agents;
        const channel = await kit.createChannel({ agentIds: [captain.id] });
        await useAgentMachineForTasks(kit, { agent: captain, projectId: channel.id });
        await awaitQuiet(kit, captain.id);
        const tag = kit.marker('BENCH');
        const ledger = openCrewLedger();
        try {
            log('assigning the Issue');
            const assignedAt = new Date().toISOString();
            const { issue } = await kit.trpc('issue.create', {
                assignee: { agentId: captain.id, kind: 'captain' },
                description: [
                    "Benchmark Python's built-in sorted() against a hand-written merge sort and quicksort on this Machine, on 10^5, 10^6 and 10^7 random integers, three runs each.",
                    'Write the results table and a one-paragraph recommendation to a Markdown file, put it in Drive, and comment its link on this Issue.',
                    `Tag the report ${tag}.`,
                ].join('\n\n'),
                priority: 'high',
                projectId: channel.id,
                serverId: kit.serverId,
                state: 'todo',
                title: 'Benchmark our sort options',
            });
            const turn = await settleTurn(captain.id, { startWithin: 60_000 });
            expect(turn.status, 'turn completed').toBe('completed');

            const tasks = await crewStartedBy(kit, captain.id, assignedAt);
            log(`Tasks started: ${tasks.map((task) => task.shortId).join(', ') || 'none'}`);
            expect(tasks, 'crew Tasks the Captain started').toHaveLength(1);
            const [task] = tasks;
            await kit.trackChat(task.chatId, { name: `task:${task.shortId}` });
            evidence.taskChat(task.chatId);

            const { issue: after } = await kit.trpc('issue.get', {
                issueId: issue.id,
                serverId: kit.serverId,
            });
            log(
                `Issue ${after.code}: ${after.state.id}, assignee ${JSON.stringify(after.assignee)}`
            );
            expect(
                after.assignee?.kind === 'task' && after.assignee.taskId === task.id,
                'Issue assigned to the Task'
            ).toBe(true);
            expect(
                ['todo', 'in_progress'].includes(after.state.id),
                `Issue state ${after.state.id} is todo or in_progress`
            ).toBe(true);

            const [brief] = (await kit.readMessages(task.chatId)).sort(
                (left, right) => left.sequence - right.sequence
            );
            expect(brief?.content ?? '', 'the brief names the Issue').toContain(after.code);

            const posts = await ledger.postsBy(captain.id, { runIds: turn.runIds });
            const channelPosts = posts.filter((post) => post.chatKind === 'channel');
            log(`Captain posts: ${posts.map((post) => post.chatKind).join(', ') || 'none'}`);
            expect(
                channelPosts.map((post) => post.content.slice(0, 80)),
                'Captain posts in a channel'
            ).toHaveLength(0);
        } finally {
            ledger.close();
        }
    }),
});

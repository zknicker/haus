import {
    awaitQuiet,
    crewStartedBy,
    openCrewLedger,
    postsOutside,
    runTasksOnAgentMachine,
} from '../crew.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A build request phrased as a question in the Captain chat starts exactly one crew Task in that same turn, whose brief carries the request; the Captain posts at most one message, in the Captain chat, delivers no Drive file itself, and posts nothing anywhere else.',
    name: 'captain-build-question-starts-crew',
    run: withRoutingEvidence(async ({ agents, evidence, expect, kit, log, settleTurn }) => {
        const [captain] = agents;
        const channel = await kit.createChannel({ agentIds: [captain.id] });
        await runTasksOnAgentMachine(kit, { agent: captain, projectId: channel.id });
        const chatId = await kit.trackChat(captain.ownChatId);
        await awaitQuiet(kit, captain.id);
        const tag = kit.marker('TEMPS');
        const ledger = openCrewLedger();
        try {
            log('asking a build question');
            const asked = await kit.harness.send(
                chatId,
                `Could we get a small Python script that turns our sensor log (a CSV with columns time,temp_f) into Celsius, with a test? Drop it in Drive and tag it ${tag}.`
            );
            const turn = await settleTurn(captain.id);
            expect(turn.status, 'Captain turn completed').toBe('completed');

            const tasks = await crewStartedBy(kit, captain.id, asked.message.createdAt);
            log(`Tasks started: ${tasks.map((task) => task.shortId).join(', ') || 'none'}`);
            expect(tasks, 'crew Tasks the Captain started in that turn').toHaveLength(1);
            const [task] = tasks;
            await kit.trackChat(task.chatId, { name: `task:${task.shortId}` });
            evidence.taskChat(task.chatId);
            const [brief] = (await kit.readMessages(task.chatId)).sort(
                (left, right) => left.sequence - right.sequence
            );
            expect(brief?.content ?? '', 'the brief carries the tag').toContain(tag);

            const posts = await ledger.postsBy(captain.id, { runIds: turn.runIds });
            log(`Captain posts: ${posts.map((post) => post.chatKind).join(', ') || 'none'}`);
            expect(
                postsOutside(posts, [chatId, task.chatId]),
                'Captain posts outside the Captain chat and the Task'
            ).toHaveLength(0);
            expect(
                posts.filter((post) => post.chatId === chatId).length <= 1,
                'at most one Captain chat post in the turn'
            ).toBe(true);
            expect(
                posts
                    .filter(
                        (post) => post.chatId === chatId && /drive\/|drive:\/\//u.test(post.content)
                    )
                    .map((post) => post.content.slice(0, 80)),
                'Captain chat posts that deliver a Drive file the Captain built itself'
            ).toHaveLength(0);
        } finally {
            ledger.close();
        }
    }),
});

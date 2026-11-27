import { awaitQuiet, openCrewLedger, postsOutside, turnsSince } from '../crew.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A Task a person starts answers its prompt and a follow-up in its own chat, posts in no other chat, and wakes no Captain.',
    name: 'home-task-works-with-person',
    run: withRoutingEvidence(async ({ agents, evidence, expect, kit, log, settleTurn }) => {
        const [bystander] = agents;
        const project = await kit.createChannel({ agentIds: [] });
        await awaitQuiet(kit, bystander.id);
        const startedAt = new Date().toISOString();
        const ledger = openCrewLedger();
        try {
            log('starting a Task from Home');
            const { task } = await kit.trpc('task.start', {
                computerId: bystander.computerId,
                model: bystander.desiredModelId,
                projectId: project.id,
                prompt: "What's 17 × 23?",
                requestId: `agenttests-${kit.stamp}-${kit.marker('')}`,
                serverId: kit.serverId,
            });
            await kit.trackChat(task.chatId, { name: `task:${task.shortId}` });
            evidence.grade({ agent: { id: task.agentId }, rootChatId: task.chatId });
            evidence.taskChat(task.chatId);

            await turnsSince(kit, task.agentId, task.createdAt);
            const first = await ledger.postsBy(task.agentId);
            expect(
                first.some((post) => post.chatId === task.chatId && /\b391\b/u.test(post.content)),
                'the Task answers 391 in its chat'
            ).toBe(true);

            log('following up in the Task');
            await kit.harness.send(task.chatId, 'Thanks. And that times 2?');
            const followUp = await settleTurn(task.agentId);
            expect(followUp.status, 'follow-up turn completed').toBe('completed');
            const posts = await ledger.postsBy(task.agentId);
            expect(
                posts.some((post) => /\b782\b/u.test(post.content)),
                'the Task answers 782 in its chat'
            ).toBe(true);
            expect(postsOutside(posts, [task.chatId]), 'Task posts outside its chat').toHaveLength(
                0
            );
            const bystanderPosts = await ledger.postsBy(bystander.id, { since: startedAt });
            expect(
                bystanderPosts.map((post) => post.content.slice(0, 80)),
                'posts by the bystander Captain'
            ).toHaveLength(0);
        } finally {
            ledger.close();
        }
    }),
});

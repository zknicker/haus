import { createHash } from 'node:crypto';
import {
    awaitQuiet,
    crewStartedBy,
    openCrewLedger,
    postsOutside,
    turnsSince,
    useAgentMachineForTasks,
} from '../crew.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A Task request in the Captain chat starts one crew Task whose brief carries the input; the Task posts the result in its own chat and its Captain hears the turn finish; the Captain tells the person the result in the Captain chat; neither agent posts in a channel.',
    name: 'crew-finish-reaches-person',
    run: withRoutingEvidence(async ({ agents, evidence, expect, kit, log, settleTurn }) => {
        const [captain] = agents;
        const channel = await kit.createChannel({ agentIds: [captain.id] });
        await useAgentMachineForTasks(kit, { agent: captain, projectId: channel.id });
        const chatId = await kit.trackChat(captain.ownChatId);
        evidence.grade({ agent: captain, rootChatId: chatId });
        await awaitQuiet(kit, captain.id);
        const text = kit.marker('RELAY');
        const digest = createHash('sha256').update(text).digest('hex').slice(0, 12);
        const ledger = openCrewLedger();
        try {
            log('asking for a crew Task');
            const asked = await kit.harness.send(
                chatId,
                `Please start a crew Task for this so it runs on the Machine: compute the SHA-256 of the exact text ${text} (no trailing newline) and tell me the first 12 hex characters.`
            );
            const turn = await settleTurn(captain.id);
            expect(turn.status, 'Captain turn completed').toBe('completed');
            const tasks = await crewStartedBy(kit, captain.id, asked.message.createdAt);
            expect(tasks, 'crew Tasks the Captain started').toHaveLength(1);
            const [task] = tasks;
            await kit.trackChat(task.chatId, { name: `task:${task.shortId}` });
            evidence.taskChat(task.chatId);
            const [brief] = (await kit.readMessages(task.chatId)).sort(
                (left, right) => left.sequence - right.sequence
            );
            expect(brief?.content ?? '', 'the brief carries the text to hash').toContain(text);

            log(`waiting for Task ${task.shortId}`);
            await turnsSince(kit, task.agentId, task.createdAt);
            const result = (await ledger.postsBy(task.agentId)).find(
                (post) => post.chatId === task.chatId && post.content.includes(digest)
            );
            expect(result !== undefined, 'the Task posts the digest in its chat').toBe(true);
            const finishes = await ledger.finishes(captain.id, task.shortId);
            log(`crew finishes: ${finishes.map((finish) => finish.ending).join(', ') || 'none'}`);

            log('waiting for the Captain to hear the Task finish');
            await turnsSince(kit, captain.id, result.createdAt, { within: 300_000 });
            const captainPosts = await ledger.postsBy(captain.id, {
                since: asked.message.createdAt,
            });
            expect(
                postsOutside(captainPosts, [chatId, task.chatId]),
                'Captain posts outside the Captain chat and its Task'
            ).toHaveLength(0);
            expect(
                postsOutside(await ledger.postsBy(task.agentId), [task.chatId]),
                'Task posts outside its chat'
            ).toHaveLength(0);
            const summaries = captainPosts.filter(
                (post) =>
                    post.chatId === chatId &&
                    Date.parse(post.createdAt) >= Date.parse(result.createdAt) &&
                    post.content.toLowerCase().includes(digest)
            );
            const { followed } = await kit.trpc('task.get', {
                serverId: kit.serverId,
                taskId: task.id,
            });
            log(
                `person follows the Task: ${followed}; relays in the Captain chat: ${summaries.length}`
            );
            expect(
                summaries.length >= 1,
                'the Captain tells the person the result in the Captain chat'
            ).toBe(true);
        } finally {
            ledger.close();
        }
    }),
});

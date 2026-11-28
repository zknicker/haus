import { startPendingChecksCrew } from '../crew-pending-checks.mjs';
import { openCrewLedger, postsOutside, turnsSince } from '../crew.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A crew Task reports its change pushed while checks are still running; asked in the Captain chat whether it is ready to merge, the Captain answers there, and only there or in the Task (the grader reads whether it called the pull request ready).',
    name: 'crew-done-checks-pending',
    run: withRoutingEvidence(async ({ agents, evidence, expect, kit, log, settleTurn }) => {
        const [captain] = agents;
        const ledger = openCrewLedger();
        try {
            const { task } = await startPendingChecksCrew(kit, { captain, log });
            evidence.taskChat(task.chatId);
            const status = (await ledger.postsBy(task.agentId)).findLast(
                (post) => post.chatId === task.chatId
            );
            expect(status !== undefined, 'the Task posts where the work stands').toBe(true);
            log('letting the Captain hear the Task end its turn');
            await turnsSince(kit, captain.id, status.createdAt, { within: 300_000 });

            const chatId = await kit.trackChat(captain.ownChatId);
            evidence.grade({ agent: captain, rootChatId: chatId });
            log('asking the Captain whether it is ready');
            const asked = await kit.harness.send(
                chatId,
                'Is the lodash bump ready to merge? I want it in today.'
            );
            const turn = await settleTurn(captain.id);
            expect(turn.status, 'Captain turn completed').toBe('completed');
            const posts = await ledger.postsBy(captain.id, { since: asked.message.createdAt });
            log(`Captain posts: ${posts.map((post) => post.chatKind).join(', ') || 'none'}`);
            expect(
                posts.some((post) => post.chatId === chatId),
                'the Captain answers in the Captain chat'
            ).toBe(true);
            expect(
                postsOutside(posts, [chatId, task.chatId]),
                'Captain posts outside the Captain chat and the Task'
            ).toHaveLength(0);
        } finally {
            ledger.close();
        }
    }),
});

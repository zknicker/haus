import { awaitQuiet, openCrewLedger, postsOutside } from '../crew.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { tasksCreatedBy } from '../task-intake.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        "A quick question posted in the Agent's own chat gets a reply there carrying the answer, no post in any other chat, and no Task.",
    name: 'captain-chat-quick-answer',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [captain] = agents;
        const chatId = await kit.trackChat(captain.ownChatId);
        await awaitQuiet(kit, captain.id);
        const ledger = openCrewLedger();
        try {
            log('asking in the own chat');
            await kit.harness.send(
                chatId,
                'Quick one: which is bigger, 2^10 or 10^3, and by how much?'
            );
            const turn = await settleTurn(captain.id);
            expect(turn.status, 'turn completed').toBe('completed');

            const posts = await ledger.postsBy(captain.id, { runIds: turn.runIds });
            log(`posts: ${posts.map((post) => post.chatKind).join(', ') || 'none'}`);
            expect(postsOutside(posts, [chatId]), 'posts outside the own chat').toHaveLength(0);
            expect(
                posts.some((post) => /\b24\b/u.test(post.content)),
                'a reply in the own chat carrying the difference, 24'
            ).toBe(true);
            expect(await tasksCreatedBy(kit, captain.id, turn), 'Tasks started').toHaveLength(0);
        } finally {
            ledger.close();
        }
    }),
});

import { reportsChecksRunning, startPendingChecksCrew } from '../crew-pending-checks.mjs';
import { openCrewLedger, postsOutside, turnsSince } from '../crew.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A crew Task the Captain started on an Issue ends its turn with the change pushed and checks still running; the Captain hears the turn end and posts in no chat but that Task (nobody asked it anything, and nothing needs a person yet).',
    name: 'crew-routine-wake-stays-quiet',
    run: withRoutingEvidence(async ({ agents, evidence, expect, kit, log }) => {
        const [captain] = agents;
        const ledger = openCrewLedger();
        try {
            const startedAt = new Date().toISOString();
            const { task } = await startPendingChecksCrew(kit, { captain, log });
            evidence.taskChat(task.chatId);
            const status = (await ledger.postsBy(task.agentId)).findLast(
                (post) => post.chatId === task.chatId
            );
            expect(reportsChecksRunning(status), 'the Task reports its checks still running').toBe(
                true
            );

            log('waiting for the Captain to hear the Task end its turn');
            const turns = await turnsSince(kit, captain.id, status.createdAt, { within: 300_000 });
            log(`Captain turns after the Task's post: ${turns.length}`);
            const posts = await ledger.postsBy(captain.id, { since: startedAt });
            log(`Captain posts: ${posts.map((post) => post.chatKind).join(', ') || 'none'}`);
            expect(
                postsOutside(posts, [task.chatId]),
                'Captain posts outside the Task on a routine wake'
            ).toHaveLength(0);
        } finally {
            ledger.close();
        }
    }),
});

// Tool-using work asked inside a DM Thread is claimed there as a Thread task
// and answered in that Thread: no top-level task or post in the DM, no raw
// `dm:@user:<ids>` task title, and a `--done` Thread send with no --reply-to.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { runThreadClaim, sealedPuzzle } from '../thread-claim.mjs';

const puzzle = sealedPuzzle({ divisor: 11, limit: 600, modulus: 101 });

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Tool-using work asked in a DM Thread is claimed as a task on that Thread message, answered in the Thread with the marker and result through a --done send with no --reply-to, and leaves no new top-level task or post in the DM.',
    name: 'thread-claim-dm',
    run: withRoutingEvidence(async (context) => {
        const { agents, kit, log, settleTurn } = context;
        const [worker] = agents;
        const dmChatId = worker.dmChatId;
        if (!dmChatId) {
            throw new Error(`Agent @${worker.handle} has no Owner DM to send into.`);
        }

        // Every DM message is addressed, so the anchor wakes a turn of its own;
        // settle it before the Thread request so the gated turn is that request's.
        log('anchoring the Thread');
        const anchor = await kit.harness.send(
            dmChatId,
            `FYI only, no response needed: Bluebird launch numbers ${kit.stamp} are in. I'll ask follow-ups in a thread here.`
        );
        await settleTurn(worker.id);

        await runThreadClaim(context, {
            anchorMessageId: anchor.message.id,
            parentChatId: dmChatId,
            puzzle,
        });
    }),
});

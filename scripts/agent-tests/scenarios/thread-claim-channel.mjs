// Tool-using work asked inside a Channel Thread is claimed there as a Thread
// claim and answered in that Thread: no top-level claim or post in the Channel,
// and a `--done` Thread send with no --reply-to.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { runThreadClaim, sealedPuzzle } from '../thread-claim.mjs';

const puzzle = sealedPuzzle({ divisor: 13, limit: 700, modulus: 97 });

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Tool-using work asked in a Channel Thread is claimed on that Thread message, answered in the Thread with the marker and result through a --done send with no --reply-to, and leaves no new top-level claim or post in the Channel.',
    name: 'thread-claim-channel',
    run: withRoutingEvidence(async (context) => {
        const { agents, kit, log } = context;
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });

        // The anchor is the Agent's own earlier post: a human anchor in a
        // one-Agent channel is addressed to it, and the Agent claims it too.
        log('anchoring the Thread');
        const anchor = await kit.authorAsAgent(
            worker.id,
            `#${channel.name}`,
            `Bluebird launch numbers ${kit.stamp} are up.`,
            { chatId: channel.id }
        );

        await runThreadClaim(context, {
            anchorMessageId: anchor.message.id,
            parentChatId: channel.id,
            puzzle,
        });
    }),
});

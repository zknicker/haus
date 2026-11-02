// Tool-using work asked inside a Channel Thread is claimed there as a Thread
// task and answered in that Thread: no top-level task or post in the Channel,
// and a `--done` Thread send with no --reply-to.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import { runThreadClaim, sealedPuzzle } from '../thread-claim.mjs';

const puzzle = sealedPuzzle({ divisor: 13, limit: 700, modulus: 97 });

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Tool-using work asked in a Channel Thread is claimed as a task on that Thread message, answered in the Thread with the marker and result through a --done send with no --reply-to, and leaves no new top-level task or post in the Channel.',
    name: 'thread-claim-channel',
    run: withRoutingEvidence(async (context) => {
        const { agents, kit, log } = context;
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });

        // An unmentioned human anchor, as in thread-reply-stays-in-thread.
        log('anchoring the Thread');
        const anchor = await kit.harness.send(channel.id, `Bluebird launch numbers ${kit.stamp}`);

        await runThreadClaim(context, {
            anchorMessageId: anchor.message.id,
            parentChatId: channel.id,
            puzzle,
        });
    }),
});

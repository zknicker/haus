import { runFollowsUpDroppedPromise } from '../heartbeat-nightly.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A promise the Agent made ("I\'ll check the shipping cutoff and get back to you") and never kept gets exactly one reminder anchored to the conversation, firing 08:00-10:00 in the requester\'s timezone and naming the promise; nothing is posted overnight.',
    name: 'heartbeat-follows-up-dropped-promise',
    optIn: true,
    run: runFollowsUpDroppedPromise,
});

import { runStaleLooseEndControl } from '../heartbeat-standing.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'After a quiet daytime heartbeat whose checkpoint lists a loose end the ledger shows resolved, an unrelated DM gets a turn that neither touches the ledger nor brings up the loose end.',
    name: 'heartbeat-stale-loose-end-control',
    optIn: true,
    run: runStaleLooseEndControl,
});

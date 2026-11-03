import { runSurfacesNewSignal } from '../heartbeat-daytime.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A daytime heartbeat on an Agent that watches a granted ledger notices a new escalated record nobody mentioned, files exactly one report, and the main session then posts once in the team Channel.',
    name: 'heartbeat-surfaces-new-signal',
    optIn: true,
    run: runSurfacesNewSignal,
});

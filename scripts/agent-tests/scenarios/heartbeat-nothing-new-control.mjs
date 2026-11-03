import { runNothingNewControl } from '../heartbeat-daytime.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A daytime heartbeat on an Agent whose watched ledger has not changed looks at it, files no report, and posts nothing.',
    name: 'heartbeat-nothing-new-control',
    optIn: true,
    run: runNothingNewControl,
});

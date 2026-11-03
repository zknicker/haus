import { runReportsUnhandledStandingItem } from '../heartbeat-standing.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A daytime heartbeat on an Agent whose watched ledger holds an actionable item the last checkpoint saw but never reported files exactly one report about it, and the main session then posts once in the team Channel, opening with a heads-up line that says what it noticed.',
    name: 'heartbeat-reports-unhandled-standing-item',
    optIn: true,
    run: runReportsUnhandledStandingItem,
});

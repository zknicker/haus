import { runQuietDayControl } from '../heartbeat-nightly.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'After an ordinary day with no corrections, a nightly heartbeat adds no Standing Preference and posts nothing.',
    name: 'heartbeat-quiet-day-control',
    optIn: true,
    run: runQuietDayControl,
});

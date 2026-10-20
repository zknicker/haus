import { runQuietRunAwareness } from '../heartbeat-daytime.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'After a quiet daytime heartbeat, asked "what have you been up to?", the Agent answers and (graded) says truthfully that it checked in.',
    name: 'heartbeat-quiet-run-awareness',
    optIn: true,
    run: runQuietRunAwareness,
});

import { runLearnsUnsavedCorrection } from '../heartbeat-nightly.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A correction a human gave in a Channel and the Agent only acknowledged ("Got it.") becomes a terse Standing Preference after a nightly heartbeat, the dream summary names the lesson and who gave it, and nothing is posted.',
    name: 'heartbeat-learns-unsaved-correction',
    optIn: true,
    run: runLearnsUnsavedCorrection,
});

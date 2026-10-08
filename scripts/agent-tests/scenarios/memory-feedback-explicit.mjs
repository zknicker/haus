import { runMemoryFeedback } from '../memory-feedback.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Feedback framed as going forward rewrites the overlapping seeded Standing Preferences rule and adds the new operational rule, and the Agent answers by both after a session reset.',
    name: 'memory-feedback-explicit',
    optIn: true,
    run: (context) => runMemoryFeedback('explicit', context),
});

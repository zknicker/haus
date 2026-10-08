import { runMemoryFeedback } from '../memory-feedback.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Without feedback the seeded Standing Preferences stay as they were; the post-reset probe reply is the baseline the feedback variants are graded against.',
    name: 'memory-feedback-control',
    optIn: true,
    run: (context) => runMemoryFeedback('control', context),
});

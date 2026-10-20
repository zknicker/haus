import { runLeadDedupe } from '../heartbeat-daytime.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'Two Agents that could both research one unanswered question run daytime heartbeats in turn; at most one lead is held on that question, and the second Agent reads the leads list before researching.',
    name: 'heartbeat-lead-dedupe',
    optIn: true,
    run: runLeadDedupe,
});

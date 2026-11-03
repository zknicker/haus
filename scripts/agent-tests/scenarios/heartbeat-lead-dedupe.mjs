import { runLeadDedupe } from '../heartbeat-lead-dedupe.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'Two Agents that both cover pricing and hold the same private source run daytime heartbeats in turn on one unanswered question only that source can answer; the question is answered with the source facts, exactly one Agent reports the answer to its main session, and exactly one answer is posted.',
    name: 'heartbeat-lead-dedupe',
    optIn: true,
    run: runLeadDedupe,
});

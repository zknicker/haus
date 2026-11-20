import { withRoutingEvidence } from '../routing-evidence.mjs';
import { runRuleFile } from '../rule-files.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A plain fact ("my timezone is Pacific") still lands in MEMORY.md, and no AGENTS.md or WORKER.md appears.',
    name: 'rule-files-fact',
    run: withRoutingEvidence((context) => runRuleFile('fact', context)),
});

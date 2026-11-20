import { withRoutingEvidence } from '../routing-evidence.mjs';
import { runRuleFile } from '../rule-files.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        '"From now on, keep replies under three sentences" lands in agents/<handle>/AGENTS.md in Drive, written by the Agent, with no WORKER.md and the rule kept out of MEMORY.md.',
    name: 'rule-files-agent',
    run: withRoutingEvidence((context) => runRuleFile('agent', context)),
});

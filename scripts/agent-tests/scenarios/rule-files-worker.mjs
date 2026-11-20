import { withRoutingEvidence } from '../routing-evidence.mjs';
import { runRuleFile } from '../rule-files.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        '"From now on, every Worker attaches before/after screenshots" lands a line in agents/<handle>/WORKER.md in Drive, written by the Agent, with no AGENTS.md, the rule kept out of MEMORY.md, and its Standing Preferences unchanged.',
    name: 'rule-files-worker',
    run: withRoutingEvidence((context) => runRuleFile('worker', context)),
});

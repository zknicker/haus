import { withRoutingEvidence } from '../routing-evidence.mjs';
import { runRuleFile } from '../rule-files.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        '"From now on, every crew Task you start attaches before/after screenshots" lands a line in agents/<handle>/WORKER.md in Drive, written by the Agent, with no AGENTS.md and MEMORY.md Standing Preferences unchanged; a Key Knowledge line pointing at WORKER.md is fine.',
    name: 'rule-files-worker',
    run: withRoutingEvidence((context) => runRuleFile('worker', context)),
});

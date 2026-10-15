// Storage-free fallback for placement S1 ("found the kit"), outside the eval:
// the kit is a file dropped into the Agent's workspace on the dev Computer.
// placement-found-the-kit-files is the graded variant; see placement-kit.mjs.

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentWorkspacePath } from '../author.mjs';
import { foundTheKitContract, runFoundTheKit, starterKit } from '../placement-kit.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract: foundTheKitContract,
    name: 'placement-found-the-kit-local',
    run: withRoutingEvidence(async (context) => {
        const { kit } = context;
        await runFoundTheKit(context, {
            exchange: {
                notYet: 'Not yet. Nothing named kit in my workspace yet.',
                question:
                    "I dropped Philip's starter kit in your workspace as starter-kit.md. Can you see it?",
                wake: 'check now! its at starter-kit.md in your workspace btw.',
            },
            placeKit: async (worker) => {
                const workspace = agentWorkspacePath({
                    agentId: worker.id,
                    repositoryRoot,
                    serverId: kit.serverId,
                });
                if (!existsSync(workspace)) {
                    throw new Error(
                        `No workspace for Agent ${worker.id} at ${workspace}; this scenario needs the Agent on this worktree's dev Computer.`
                    );
                }
                await writeFile(path.join(workspace, 'starter-kit.md'), starterKit);
            },
        });
    }),
});

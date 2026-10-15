// Placement eval S1 ("found the kit"), Files variant: the kit is a Server
// file the human added to Files. See placement-kit.mjs for the shared flow;
// placement-found-the-kit-local is the storage-free variant.

import { deleteArtifacts, publishArtifactAsMember } from '../artifact-evidence.mjs';
import { foundTheKitContract, runFoundTheKit, starterKit } from '../placement-kit.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    // Seeding a Server file needs enabled development artifact storage (R2).
    optIn: true,
    contract: foundTheKitContract,
    name: 'placement-found-the-kit-files',
    run: withRoutingEvidence(async (context) => {
        const { kit } = context;
        const published = [];
        try {
            published.push(
                await publishArtifactAsMember(kit, {
                    content: factoryPlan,
                    path: 'design-factory/factory-plan.md',
                    title: 'Design Factory Plan',
                })
            );
            await runFoundTheKit(context, {
                exchange: {
                    notYet: 'Not yet. `haus artifact list` shows only the factory plan. Searching for "kit" finds nothing.',
                    question: "Oh! So I added Philip's starter kit to our files. Can you see it?",
                    wake: 'check now! its been renamed to files btw.',
                },
                placeKit: async () => {
                    published.push(
                        await publishArtifactAsMember(kit, {
                            content: starterKit,
                            path: 'design-factory/pod-folder-system-starter-kit.md',
                            title: 'Pod Folder System Starter Kit',
                        })
                    );
                },
            });
        } finally {
            await deleteArtifacts(kit, published);
        }
    }),
});

const factoryPlan = `# Design Factory Plan

Weekly cadence for the print-on-demand design factory.

- Monday: pick niches from the research sheet.
- Tuesday to Thursday: produce designs, three per niche.
- Friday: review and upload the batch.
`;

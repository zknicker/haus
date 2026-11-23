import {
    macbookName,
    openComputerLedger,
    summarizeInvocations,
    turnRunIds,
} from '../computer-world.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        "Asked for a screenshot of the human's MacBook, which allows the Agent, the Agent targets at least one tool call at the MacBook and sends no desktop call to its home Computer.",
    name: 'computer-target-screenshot-macbook',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const ledger = openComputerLedger();
        let macbook = null;
        try {
            macbook = await ledger.seedMacbook(worker.id);
            log(
                `seeded offline ${macbookName} ${macbook.computerId} beside home ${macbook.home.name ?? macbook.home.id}`
            );
            const channel = await kit.createChannel({ agentIds: [worker.id] });

            log('asking for the screenshot');
            await kit.harness.send(
                channel.id,
                `@${worker.handle} can you grab a screenshot of my MacBook?`
            );
            const turn = await settleTurn(worker.id);
            log(`turn ${turn.status}`);

            const calls = summarizeInvocations(await ledger.readInvocations(worker.id), {
                homeId: macbook.home.id,
                runIds: turnRunIds(turn),
                target: { id: macbook.computerId, name: macbookName },
            });
            log(`calls: ${calls.lines.join('; ') || 'none'}`);
            expect(calls.onTarget.length > 0, `calls on the ${macbookName}`).toBe(true);
            expect(calls.desktopOnHome, 'desktop calls on the home Computer').toHaveLength(0);
        } finally {
            try {
                await macbook?.cleanup();
            } finally {
                await ledger.close();
            }
        }
    }),
});

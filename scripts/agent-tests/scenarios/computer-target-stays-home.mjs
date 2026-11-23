import { openComputerLedger, summarizeInvocations, turnRunIds } from '../computer-world.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Asked a question about its own machine, the Agent completes the turn with at least one tool call, every call runs on its home Computer, and none is refused.',
    name: 'computer-target-stays-home',
    async run({ agents, expect, kit, log, settleTurn }) {
        const [worker] = agents;
        const ledger = openComputerLedger();
        try {
            const home = await ledger.readHome(worker.id);
            expect(Boolean(home), 'the Agent has a home Computer').toBe(true);
            const channel = await kit.createChannel({ agentIds: [worker.id] });

            log(`asking about the home Computer ${home.name ?? home.id}`);
            await kit.harness.send(
                channel.id,
                `@${worker.handle} what's the free disk space on your machine?`
            );
            const turn = await settleTurn(worker.id);
            expect(turn.status, 'turn status').toBe('completed');

            const calls = summarizeInvocations(await ledger.readInvocations(worker.id), {
                homeId: home.id,
                runIds: turnRunIds(turn),
            });
            log(`calls: ${calls.lines.join('; ') || 'none'}`);
            expect(calls.total > 0, 'tool calls in the turn').toBe(true);
            expect(calls.away, 'calls off the home Computer').toHaveLength(0);
            expect(calls.refused, 'refused calls').toHaveLength(0);
        } finally {
            await ledger.close();
        }
    },
});

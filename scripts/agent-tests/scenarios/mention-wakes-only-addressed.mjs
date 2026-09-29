// A direct mention wakes exactly the Agent it names. The addressed worker
// answers once, top level or in a Thread on the human's message (a Thread
// answer reaches its anchor's author, ADR 0037); the second Agent sitting in
// the same channel writes nothing at all, top level or in any Thread.

import { authoredInChannel } from '../channel-messages.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'A mention addressed to one Agent produces exactly one reply from that Agent carrying the requested marker, top level or in a Thread on the mention, and the unaddressed Agent in the same channel stays silent everywhere, Threads included.',
    name: 'mention-wakes-only-addressed',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [worker, bystander] = agents;
        const token = marker();

        const channel = await kit.createChannel({ agentIds: [worker.id, bystander.id] });
        const head = await kit.readHead(channel.id);
        log('sending the mention');

        await kit.harness.send(channel.id, `@${worker.handle} reply with exactly ${token}.`);

        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');
        expect(turn.outputProduced, 'turn produced durable output').toBe(true);

        log('checking gates');
        const replies = await authoredInChannel(kit, channel.id, worker.id, head);
        expect(replies, 'replies from the addressed Agent').toHaveLength(1);
        expect(replies[0], 'addressed reply').toContain(token);

        // The bystander shares the channel, so silence is only meaningful once
        // its own delivery queue has gone quiet on the Server.
        await kit.harness.waitForAgentQuiet(bystander.id, 10_000, 300_000);
        await kit.expectNoAgentMessages(channel.id, bystander.id, head);
        expect(
            await authoredInChannel(kit, channel.id, bystander.id, head),
            'replies from the unaddressed Agent'
        ).toHaveLength(0);
    },
});

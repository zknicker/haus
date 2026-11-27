// The same no-response contract in the Agent's own chat, where every message
// is addressed by definition. The DM belongs to the Agent, so this scenario
// anchors on its head and lets Agent retirement carry it away.

import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A DM that explicitly requires no response wakes a turn that settles with no durable output and leaves the own chat unchanged after its head.',
    name: 'fyi-silence-dm',
    async run({ agents, expect, kit, log }) {
        const [worker] = agents;
        const dmChatId = worker.ownChatId;
        if (!dmChatId) {
            throw new Error(`Agent @${worker.handle} has no own chat to send into.`);
        }

        const head = await kit.readHead(dmChatId);
        log('sending the FYI');
        await kit.harness.send(
            dmChatId,
            `FYI only, no response needed: deploy ${kit.stamp} finished cleanly.`
        );

        log('waiting for a silent turn');
        const turn = await kit.assertSilence(worker.id, dmChatId, { sinceSequence: head });
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');
        expect(turn.outputProduced, 'turn produced durable output').toBe(false);
        expect(turn.messageCount, 'durable messages in the turn').toBe(0);

        const messages = await kit.readMessages(dmChatId);
        expect(kit.authoredBy(messages, worker.id, head), 'replies in the own chat').toHaveLength(
            0
        );
    },
});

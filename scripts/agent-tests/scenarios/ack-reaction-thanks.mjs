// A human's "thanks" after an answer needs no reply. The Agent acknowledges it
// with one reaction of its own choosing on that message and sends nothing.

import { normalizeReactionEmoji } from '../../../packages/haus-api/src/reaction-emoji.ts';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A thank-you after an answered DM question settles a turn with no durable message and exactly one single-emoji Agent reaction on the thank-you.',
    name: 'ack-reaction-thanks',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const dmChatId = worker.dmChatId;
        if (!dmChatId) {
            throw new Error(`Agent @${worker.handle} has no Owner DM to send into.`);
        }
        await kit.trackChat(dmChatId);

        log('asking a question');
        await kit.harness.send(dmChatId, 'What is 7 multiplied by 6? Answer briefly.');
        const answered = await settleTurn(worker.id);
        expect(answered.outputProduced, 'the question was answered').toBe(true);

        const head = await kit.readHead(dmChatId);
        log('saying thanks');
        const thanks = await kit.harness.send(dmChatId, "thanks, that's perfect!");

        const turn = await kit.assertSilence(worker.id, dmChatId, { sinceSequence: head });
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.messageCount, 'durable messages in the thanks turn').toBe(0);

        const target = (await kit.readMessages(dmChatId)).find(
            (message) => message.id === thanks.message.id
        );
        const reactions = (target?.reactions ?? []).filter((reaction) =>
            reaction.actors.some((actor) => actor.kind === 'agent' && actor.id === worker.id)
        );
        expect(reactions, 'Agent reactions on the thank-you').toHaveLength(1);
        expect(normalizeReactionEmoji(reactions[0]?.emoji ?? '') !== null, 'one emoji').toBe(true);
    }),
});

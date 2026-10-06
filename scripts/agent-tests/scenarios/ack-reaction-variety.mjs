// Acknowledgements in different tones each get one reaction and no send, and
// the Agent's emoji vary with the message rather than repeating one default.
// Two distinct is the bar: similar tones may honestly share an emoji, but one
// emoji for every tone is the default-reaction regression this guards.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const ACKNOWLEDGEMENTS = ['lol nice', 'we shipped it!!', 'sounds good', 'thank you so much'];
const MIN_DISTINCT_EMOJI = 2;

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Four no-reply acknowledgements in one DM each settle a turn with no durable message and exactly one Agent reaction, using at least two distinct emoji.',
    name: 'ack-reaction-variety',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const dmChatId = worker.dmChatId;
        if (!dmChatId) {
            throw new Error(`Agent @${worker.handle} has no Owner DM to send into.`);
        }
        await kit.trackChat(dmChatId);

        log('asking a question to acknowledge');
        await kit.harness.send(dmChatId, 'What is 7 multiplied by 6? Answer briefly.');
        await settleTurn(worker.id);

        const head = await kit.readHead(dmChatId);
        const acknowledgementIds = [];
        for (const content of ACKNOWLEDGEMENTS) {
            log(`acknowledging: ${content}`);
            const sent = await kit.harness.send(dmChatId, content);
            acknowledgementIds.push(sent.message.id);
            const turn = await kit.assertSilence(worker.id, dmChatId, { sinceSequence: head });
            expect(turn.status, `turn status after "${content}"`).toBe('completed');
        }

        const messages = await kit.readMessages(dmChatId);
        const chosen = acknowledgementIds.map((id, index) => {
            const reactions = (messages.find((message) => message.id === id)?.reactions ?? [])
                .filter((reaction) =>
                    reaction.actors.some(
                        (actor) => actor.kind === 'agent' && actor.id === worker.id
                    )
                )
                .map((reaction) => reaction.emoji);
            expect(reactions, `Agent reactions on "${ACKNOWLEDGEMENTS[index]}"`).toHaveLength(1);
            return reactions[0];
        });
        log(`chosen emoji: ${chosen.join(' ')}`);
        expect(new Set(chosen).size >= MIN_DISTINCT_EMOJI, 'distinct emoji across tones').toBe(
            true
        );
    }),
});

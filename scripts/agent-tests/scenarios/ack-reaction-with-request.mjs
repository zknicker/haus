// A "thanks" that also asks for something is a request, not an acknowledgement:
// the Agent answers it with a message rather than settling for a reaction.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A thank-you that also asks a new question settles a turn that authors a DM answer carrying the requested result.',
    name: 'ack-reaction-with-request',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const dmChatId = worker.dmChatId;
        if (!dmChatId) {
            throw new Error(`Agent @${worker.handle} has no Owner DM to send into.`);
        }
        await kit.trackChat(dmChatId);

        log('asking a question');
        await kit.harness.send(dmChatId, 'What is 7 multiplied by 6? Answer briefly.');
        await settleTurn(worker.id);

        const head = await kit.readHead(dmChatId);
        log('saying thanks with a follow-up request');
        await kit.harness.send(dmChatId, 'thanks! also can you tell me what 9 times 8 is?');

        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn status').toBe('completed');
        const replies = kit.authoredBy(await kit.readMessages(dmChatId), worker.id, head);
        expect(replies.length > 0, 'the follow-up request was answered').toBe(true);
        expect(replies.join('\n'), 'follow-up answer').toContain('72');
    }),
});

// An ordinary question in the Owner DM gets exactly one answer — not a running
// commentary. The DM is the Agent's standing chat, so this anchors on its head
// and leaves it in place.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A plain DM question settles one turn that authors exactly one durable DM message, and that message carries the answer.',
    name: 'dm-single-concise-reply',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const dmChatId = worker.dmChatId;
        if (!dmChatId) {
            throw new Error(`Agent @${worker.handle} has no Owner DM to send into.`);
        }
        await kit.trackChat(dmChatId);

        const head = await kit.readHead(dmChatId);
        log('asking in the Owner DM');
        await kit.harness.send(dmChatId, 'What is 7 multiplied by 6? Answer briefly.');

        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');
        expect(turn.outputProduced, 'turn produced durable output').toBe(true);

        log('checking gates');
        const replies = kit.authoredBy(await kit.readMessages(dmChatId), worker.id, head);
        expect(replies, 'replies in the Owner DM').toHaveLength(1);
        expect(replies[0], 'DM answer').toContain('42');
    }),
});

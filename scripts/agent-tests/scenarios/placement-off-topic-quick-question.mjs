// Placement control for side work: a one-off off-topic question in a purpose
// channel is still answered with one inline reply and no Thread. Guards the
// channel-purpose sentence against turning every off-topic answer into a Thread.

import {
    expectDoneToRequest,
    expectSharedPlacement,
    findResultPost,
    readPlacement,
} from '../placement.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A one-off off-topic question in a finance channel gets exactly one inline reply carrying the answer, no reaction, and no Thread.',
    name: 'placement-off-topic-quick-question',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({
            agentIds: [worker.id],
            name: `finance-${kit.stamp.slice(-6)}-${marker('').toLowerCase()}`,
        });

        log('seeding finance chatter');
        await kit.harness.send(
            channel.id,
            'fyi October card statements are in, totals look normal. Reconciling Friday.'
        );
        await settleTurn(worker.id).catch((error) => {
            if (!/no turn started/u.test(String(error))) {
                throw error;
            }
        });

        log('asking the off-topic question');
        const question = await kit.harness.send(
            channel.id,
            'random one, not finance: which HTTP status code means Too Many Requests?'
        );
        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn completed').toBe('completed');

        const placement = await readPlacement(kit, turn, {
            agentId: worker.id,
            channelId: channel.id,
            requestIds: [question.message.id],
        });
        const result = findResultPost(placement.channelPosts, (entry) =>
            entry.message.content.includes('429')
        );
        expectSharedPlacement(expect, placement, result);
        expectDoneToRequest(expect, placement, { requestIds: [question.message.id] });
        expect(placement.channelPosts, 'channel posts').toHaveLength(1);
        expect(placement.threadPosts, 'Thread posts').toHaveLength(0);
        const asked = placement.page.messages.find((message) => message.id === question.message.id);
        const reactions = (asked?.reactions ?? []).filter((reaction) =>
            reaction.actors.some((actor) => actor.kind === 'agent' && actor.id === worker.id)
        );
        expect(reactions, 'Agent reactions on the question').toHaveLength(0);
    }),
});

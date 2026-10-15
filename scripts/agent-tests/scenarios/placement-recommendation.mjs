// Placement eval S6: "pick one and say why" gets one inline reply naming a
// pick, with no plan and no offer. Length, tails and whether exactly one
// option is the pick are graded out of band by scripts/eval/grade.mjs.

import {
    expectDoneToRequest,
    expectSharedPlacement,
    findResultPost,
    readPlacement,
} from '../placement.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const options = /\bdog[\s-]?moms?\b|\bteachers?\b/iu;

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A pick-one recommendation gets exactly one inline channel reply naming one of the two options, nothing in any Thread, and a --done send to the channel.',
    name: 'placement-recommendation',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({
            agentIds: [worker.id],
            name: `design-factory-${kit.marker('').toLowerCase()}`,
        });

        log('asking for a recommendation');
        const request = await kit.harness.send(
            channel.id,
            'dog moms or teachers for the first test batch? pick one and say why.'
        );
        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn completed').toBe('completed');

        const placement = await readPlacement(kit, turn, {
            agentId: worker.id,
            channelId: channel.id,
            requestIds: [request.message.id],
        });
        log(
            `posts: ${[...placement.channelPosts, ...placement.threadPosts].map((entry) => entry.label).join(', ') || 'none'}`
        );
        const result = findResultPost(placement.channelPosts, (entry) =>
            options.test(entry.message.content)
        );
        expectSharedPlacement(expect, placement, result);
        expectDoneToRequest(expect, placement, { requestIds: [request.message.id] });
        expect(placement.channelPosts, 'channel posts').toHaveLength(1);
        expect(placement.threadPosts, 'Thread posts').toHaveLength(0);
    }),
});

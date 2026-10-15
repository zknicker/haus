// Placement eval S2: a quick factual question already answered earlier in the
// channel gets exactly one inline reply, and nothing else: no reaction, no
// Thread, no pickup note. Brevity, tails and tone are graded out of band by
// scripts/eval/grade.mjs.

import {
    expectDoneToRequest,
    expectSharedPlacement,
    findResultPost,
    readPlacement,
} from '../placement.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const port = '43447';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A quick factual question gets exactly one inline reply carrying the fact, no reaction on the question, no Thread, and no --done send into a Thread.',
    name: 'placement-quick-fact',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });

        log('seeding the earlier fact');
        await kit.harness.send(channel.id, `fyi dev server port is ${port} this week`);
        // The sole Agent in a one-human channel is addressed by every message,
        // so the FYI wakes a turn of its own. Settle it before asking.
        await settleTurn(worker.id).catch((error) => {
            if (!/no turn started/u.test(String(error))) {
                throw error;
            }
        });

        log('asking the quick question');
        const question = await kit.harness.send(
            channel.id,
            'what port is the dev server on again?'
        );
        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn completed').toBe('completed');

        const placement = await readPlacement(kit, turn, {
            agentId: worker.id,
            channelId: channel.id,
            requestIds: [question.message.id],
        });
        log(
            `posts: ${[...placement.channelPosts, ...placement.threadPosts].map((entry) => entry.label).join(', ') || 'none'}`
        );
        const result = findResultPost(placement.channelPosts, (entry) =>
            entry.message.content.includes(port)
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
        expect(
            placement.page.threads.filter((thread) => thread.replyCount > 0),
            'Threads with replies'
        ).toHaveLength(0);
    }),
});

// An explicitly created claim is claimed before the Agent replies, and the reply
// lands inline in the channel where the request arrived. Agents never post into
// the claim Thread on the human's request (ADR 0029).

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An explicitly created claim is claimed by that Agent before it replies, answered inline in the channel where it arrived with the requested marker, and its claim Thread stays empty.',
    name: 'task-thread-routing',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const token = marker();

        const channel = await kit.createChannel({ agentIds: [worker.id] });
        log('sending claim');

        const created = await kit.sendClaim(
            channel.id,
            `@${worker.handle} Draft a two-sentence Bluebird launch blurb for independent bookstores. Include the exact marker ${token}.`
        );

        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');
        expect(turn.outputProduced, 'turn produced durable output').toBe(true);

        log('checking gates');
        const claim = await kit.readClaim(created.messageId);
        // A one-shot claim may already be advanced past in_progress at settlement;
        // the contract is claim-before-reply, not catching the transient state.
        expect(
            ['in_progress', 'in_review', 'done'].includes(claim.status),
            `claim status left todo (got ${claim.status})`
        ).toBe(true);
        expect(claim.assigneeAgentId, 'claim assignee').toBe(worker.id);

        // Acknowledge-then-deliver is legitimate; the contract is that delivery
        // lands inline in the channel, not how many messages carry it there.
        const channelReplies = (await turn.authoredMessagesIn(channel.id)).filter(
            (message) => message.chatId === channel.id
        );
        expect(channelReplies.length > 0, 'the channel received a reply').toBe(true);
        expect(
            channelReplies.some((reply) => reply.content.includes(token)),
            `a channel reply carries the marker ${token}`
        ).toBe(true);
        expect(
            Date.parse(claim.claimedAt ?? '') <= Date.parse(channelReplies[0].createdAt),
            'claim happened before the first channel reply'
        ).toBe(true);

        expect(
            await turn.authoredMessagesIn(created.threadChatId),
            'replies in the claim Thread'
        ).toHaveLength(0);
    }),
});

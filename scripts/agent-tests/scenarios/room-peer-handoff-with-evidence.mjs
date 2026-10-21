// A peer's handoff carries everything the next owner needs (Manual card
// pattern/evidence-handoff). The human asks the channel for the net amount due
// on three overdue invoices. The peer Agent answers with an inline-reply
// handoff that @mentions the worker and carries the ledger lines (marked), the
// credit memo, the acceptance criterion, and where to post. The worker should
// deliver the net once, inline in the human's exchange with `--done`, and
// reach the number only the handoff's evidence yields.
//
// Decoys: re-asking the human for inputs the handoff already holds, and
// pinging the peer back for nothing. Both Agents' delivery is held while the
// exchange is seeded, so the worker wakes once on the whole exchange. The peer
// stays stopped throughout: it speaks only through the seeded handoff, which is
// an Agent-authored inline reply with a personal @mention, and those deliver to
// the mentioned Agent like any mention (specs/inbox.md "Delivery planning";
// ADR 0030 leaves Agent-authored messages on deterministic delivery).

import { humanAuthorId } from '../human-addressing.mjs';
import { expectDoneToRequest, journalCommands, parseDoneSends } from '../placement.mjs';
import { agentPosts, expectSettled, humanAddressedPosts, mentionsAgent } from '../room-b.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

// 1,284.50 + 377.25 + 2,019.80 = 3,681.55; minus the 112.40 credit = 3,569.15.
const netDue = /\b3,?569\.15\b/u;

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'Handed a deliverable by a peer Agent whose @mention handoff carries the data, the acceptance criterion, and where to post, the worker posts the net once as an inline reply in the human’s exchange with --done, asks the human no question, and does not @mention the peer.',
    name: 'room-peer-handoff-with-evidence',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, peer] = agents;
        const token = marker('LEDGER');
        const channel = await kit.createChannel({ agentIds: [worker.id, peer.id] });
        const head = await kit.readHead(channel.id);

        log('holding delivery while the exchange is seeded');
        await kit.trpc('agent.stop', { agentId: peer.id, serverId: kit.serverId });
        await kit.trpc('agent.stop', { agentId: worker.id, serverId: kit.serverId });
        try {
            const request = await kit.harness.send(
                channel.id,
                `${token} For the Q3 close I need the net amount due on the Halcyon account's three overdue invoices. Reply here when someone has it.`
            );
            const userId = humanAuthorId(request.message);
            const handoff = await kit.authorAsAgent(
                peer.id,
                `#${channel.name}`,
                [
                    `@${worker.handle} handing this one to you, I'm heads-down on the billing migration.`,
                    `From the ledger export for Halcyon: INV-${token}-1 is $1,284.50, INV-${token}-2 is $377.25, INV-${token}-3 is $2,019.80,`,
                    `and open credit memo CM-${token} for $112.40 applies to this account.`,
                    'Done means the net amount due to the cent: the three invoices minus the credit.',
                    'Post it as an inline reply to the request above.',
                ].join(' '),
                { chatId: channel.id, replyToMessageId: request.message.id }
            );

            log('releasing the worker');
            await kit.trpc('agent.start', { agentId: worker.id, serverId: kit.serverId });
            const turn = await settleTurn(worker.id);
            expectSettled(expect, turn, 'handoff turn');
            await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);

            const posts = await agentPosts(kit, channel.id, worker.id, head);
            log(`worker posts: ${posts.length}`);
            const results = posts.filter((message) => netDue.test(message.content));
            expect(results, 'posts carrying the net amount due').toHaveLength(1);
            const [result] = results;
            expect(result.chatId, 'result is in the channel, not a Thread').toBe(channel.id);
            expect(result.reply?.rootMessageId, 'result is inline in the human’s exchange').toBe(
                request.message.id
            );

            const questions = (
                await humanAddressedPosts(kit, {
                    agentId: worker.id,
                    channelId: channel.id,
                    userId,
                })
            ).filter((message) => message.id !== result.id && message.content.includes('?'));
            expect(
                questions.map((message) => message.content),
                'questions put to the human'
            ).toHaveLength(0);
            expect(
                posts
                    .filter((message) => mentionsAgent(message.content, peer))
                    .map((message) => message.content),
                'worker posts that @mention the peer'
            ).toHaveLength(0);

            const doneSends = parseDoneSends(await journalCommands(kit, worker.id, turn));
            log(
                `--done sends: ${doneSends.map((send) => `${send.target} reply-to=${send.replyTo || 'none'}`).join('; ') || 'none seen'}`
            );
            expectDoneToRequest(
                expect,
                { doneSends },
                { requestIds: [request.message.id, handoff.message.id] }
            );
        } finally {
            await kit.trpc('agent.start', { agentId: worker.id, serverId: kit.serverId });
        }
    }),
});

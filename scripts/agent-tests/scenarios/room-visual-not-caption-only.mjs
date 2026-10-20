// The Owner mentions the first Agent with a small table of quarterly revenue
// for four regions and asks for a quick comparison chart; a second Agent sits
// in the same channel. The managed visuals skill says the answer is one
// ```visual fence of hand-drawn SVG, that a table never goes inside a visual,
// that raw HTML lives only in the fence, and that the reply text carries the
// takeaway beside it. Decoys: the data table pushed into the visual frame, and
// a reply that is the visual plus a caption with nothing to say. Prose quality
// beyond "there is a takeaway" belongs to the grader.

import { splitVisualFences } from '../../../packages/haus-api/src/widgets/visual/contracts.ts';
import { readPlacement } from '../placement.mjs';
import { expectSettled, ownerSend, postsAcrossChannel } from '../room-c.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const regions = {
    Eastvale: [90, 110, 128, 151],
    Northwind: [120, 135, 150, 170],
    Southreach: [140, 138, 132, 125],
    Westmarch: [160, 158, 161, 163],
};

/** A caption is a few words; a takeaway sentence is more than this. */
const captionWordCeiling = 5;

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'A mention asking for a quick comparison chart of four regions by quarter gets exactly one channel reply from the addressed Agent, after at most a pickup note (working notes only in the Thread on that note), carrying one visual fence whose body is SVG chart marks naming every region and holds no table, beside reply text longer than a caption with no raw HTML; the second Agent writes nothing.',
    name: 'room-visual-not-caption-only',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, bystander] = agents;
        const token = marker('REGIONS');
        const channel = await kit.createChannel({ agentIds: [worker.id, bystander.id] });
        const head = await kit.readHead(channel.id);

        log('asking for the chart');
        const rows = Object.entries(regions)
            .map(([region, values]) => `${region} ${values.join(', ')}`)
            .join('. ');
        const request = await ownerSend(
            kit,
            channel.id,
            `@${worker.handle} Revenue by region ${token}, $K, Q1 to Q4: ${rows}. Can you give me a quick comparison chart?`
        );
        const turn = await settleTurn(worker.id);
        expectSettled(expect, turn, 'chart turn');
        await kit.harness.waitForAgentQuiet(bystander.id, 10_000, 300_000);

        log('checking gates');
        // A pickup note before the answer is ordinary, and working notes may go in
        // the Thread on that note (the placement contract); the answer is one
        // channel post and nothing follows it there.
        const placement = await readPlacement(kit, turn, {
            agentId: worker.id,
            channelId: channel.id,
            requestIds: [request.message.id],
        });
        const channelPosts = placement.channelPosts.map((entry) => entry.message);
        const charted = channelPosts.filter((post) => hasVisual(post.content));
        expect(charted, 'channel replies carrying a visual').toHaveLength(1);
        const [reply] = charted;
        expect(
            channelPosts.filter((post) => post.sequence > reply.sequence),
            'channel posts after the visual reply'
        ).toHaveLength(0);
        expect(channelPosts.length <= 2, 'at most a pickup note beside the visual reply').toBe(
            true
        );
        expect(
            placement.threadPosts
                .filter((entry) => entry.label !== 'working-thread')
                .map((entry) => entry.label),
            'Thread posts outside the working Thread'
        ).toHaveLength(0);
        expect(
            placement.threadPosts.filter((entry) => hasVisual(entry.message.content)),
            'visual landed in a Thread'
        ).toHaveLength(0);
        const segments = splitVisualFences(reply.content);
        const visuals = segments.filter((segment) => segment.kind === 'visual');
        expect(visuals, 'visual fences in the reply').toHaveLength(1);
        const [visual] = visuals;
        expect(visual.open, 'the visual fence left open').toBe(false);
        expect(/<svg\b/iu.test(visual.html), 'the visual draws SVG').toBe(true);
        expect(
            /<(?:rect|path|polyline|line|circle)\b/iu.test(visual.html),
            'the visual carries chart marks'
        ).toBe(true);
        expect(/<table\b/iu.test(visual.html), 'a table inside the visual').toBe(false);
        expect(
            Object.keys(regions).filter((region) => !visual.html.includes(region)),
            'regions missing from the visual'
        ).toHaveLength(0);

        const prose = segments
            .filter((segment) => segment.kind === 'text')
            .map((segment) => segment.text)
            .join(' ');
        expect(
            /<(?:svg|div|table|style|script|span)\b/iu.test(prose),
            'raw HTML in the reply text'
        ).toBe(false);
        expect(
            prose.split(/\s+/u).filter((word) => /\w/u.test(word)).length,
            'words of reply text beside the visual'
        ).toBeGreaterThan(captionWordCeiling);

        expect(
            await postsAcrossChannel(kit, channel.id, bystander.id, head),
            'posts from the second Agent'
        ).toHaveLength(0);
    }),
});

function hasVisual(content) {
    return splitVisualFences(content).some((segment) => segment.kind === 'visual');
}

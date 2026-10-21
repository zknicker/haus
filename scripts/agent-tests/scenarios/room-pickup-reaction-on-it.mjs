// A human @mentions one Agent with genuinely multi-step shell work in a channel
// where a second Agent also sits. The communication-style pickup bullet says:
// work that runs commands gets the signature-emoji reaction on the request, and
// several steps also get a one-line "on it" note with no plan; the answer is an
// inline `--done` reply to the request. The addressed Agent reacts once, posts
// exactly one pickup note inline, then answers inline. Decoys: the bystander
// chiming in, and working notes posted as inline replies to the request (each
// one notifies the requester) or in the request's Thread instead of in the
// Thread on the Agent's own pickup note. Progress itself is not required here;
// `solo-progress-threads-on-ack` gates it when the human asks to be kept posted.

import { gzipSync } from 'node:zlib';

import { normalizeReactionEmoji } from '../../../packages/haus-api/src/reaction-emoji.ts';
import { expectDoneToRequest, readPlacement } from '../placement.mjs';
import { agentPostsSince, agentReactions } from '../room-a.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

// Multiples of 11 in 1..300: 27; their sum 4,158; 4,158 mod 89 = 64.
const expectedAnswer = '64';

// The provisioner creates Agents without a signature emoji, so each one picks
// up with the default (packages/haus-api/src/agent-creation.ts).
const defaultSignatureEmoji = '👀';

// Each step is sealed inside the previous one, so the work cannot collapse
// into one shell command: it is several steps by construction.
const unpack = (blob) => `echo ${blob} | base64 -d | gunzip`;
const seal = (text) => gzipSync(Buffer.from(text)).toString('base64');
const step4 = seal('Step 4 of 4: take your step 3 sum mod 89. That is the final number to report.');
const step3 = seal(
    `Step 3 of 4: sum the multiples of 11 you counted in step 2. Then unpack step 4: ${unpack(step4)}`
);
const step2 = seal(
    `Step 2 of 4: count how many numbers in that file are divisible by 11. Then unpack step 3: ${unpack(step3)}`
);
const step1 = seal(
    `Step 1 of 4: write the numbers 1 to 300, one per line, to a file in your workspace. Then unpack step 2: ${unpack(step2)}`
);

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'An @mentioned multi-step shell request in a two-Agent channel gets exactly one signature-emoji reaction from the addressed Agent, exactly one one-line inline pickup note before an inline --done answer carrying the marker, no post in the request Thread or elsewhere outside its own working Thread, and nothing from the other Agent.',
    name: 'room-pickup-reaction-on-it',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, bystander] = agents;
        const token = marker('PICKUP');
        const channel = await kit.createChannel({ agentIds: [worker.id, bystander.id] });
        const head = await kit.readHead(channel.id);

        log('sending the multi-step request');
        const request = await kit.harness.send(
            channel.id,
            `@${worker.handle} Four-step relay puzzle for you, run it yourself in the shell. Each step's instructions are sealed in the step before, so start by unpacking step 1: \`${unpack(step1)}\`. Give me the final number with the exact marker ${token}.`
        );
        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn status').toBe('completed');
        expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');

        const placement = await readPlacement(kit, turn, {
            agentId: worker.id,
            channelId: channel.id,
            requestIds: [request.message.id],
        });
        log(
            `posts: ${[...placement.channelPosts, ...placement.threadPosts].map((entry) => entry.label).join(', ') || 'none'}`
        );

        const target = (await kit.readMessages(channel.id)).find(
            (message) => message.id === request.message.id
        );
        const reactions = agentReactions(target, worker.id);
        log(
            `reactions on the request: ${reactions.map((entry) => entry.emoji).join(' ') || 'none'}`
        );
        expect(reactions, 'addressed Agent reactions on the request').toHaveLength(1);
        expect(
            normalizeReactionEmoji(reactions[0].emoji),
            'the pickup reaction is the signature emoji'
        ).toBe(normalizeReactionEmoji(defaultSignatureEmoji));

        const { channelPosts } = placement;
        expect(
            channelPosts.length <= 2,
            'at most a pickup note and the answer in the channel'
        ).toBe(true);
        const answer = channelPosts.findLast((entry) => entry.message.content.includes(token));
        expect(Boolean(answer), 'final answer with the marker in the channel').toBe(true);
        expect(answer.message.content.includes(expectedAnswer), 'computed result').toBe(true);
        expect(answer.label, 'answer placement').toBe('inline-reply');

        const notes = channelPosts.filter((entry) => entry !== answer);
        expect(notes, 'pickup notes in the channel').toHaveLength(1);
        const [note] = notes;
        expect(note.label, 'pickup note placement').toBe('inline-reply');
        expect(note.message.content.trim().includes('\n'), 'pickup note spans one line').toBe(
            false
        );
        expect(
            note.message.sequence < answer.message.sequence,
            'pickup note precedes the answer'
        ).toBe(true);

        // Working notes are optional, but when present they live only in the
        // Thread on the Agent's own post: never the request's Thread.
        const stray = placement.threadPosts.filter((entry) => entry.label !== 'working-thread');
        expect(
            stray.map((entry) => entry.label),
            'Thread posts outside the working Thread'
        ).toHaveLength(0);
        expect(
            placement.threadPosts.filter((entry) => entry.message.content.includes(token)),
            'answer landed in the working Thread'
        ).toHaveLength(0);

        expectDoneToRequest(expect, placement, { requestIds: [request.message.id] });
        expect(
            placement.doneInThread.map((send) => send.target),
            '--done sends that went to a Thread'
        ).toHaveLength(0);
        const noteBody = note.message.content.trim();
        expect(
            placement.doneSends.filter((send) => send.body !== '' && send.body === noteBody),
            '--done sends carrying the pickup note'
        ).toHaveLength(0);

        // Silence is only meaningful once the bystander's queue is quiet on the Server.
        await kit.harness.waitForAgentQuiet(bystander.id, 10_000, 300_000);
        const deliveries = (await kit.turns.listDeliveries(bystander.id)) ?? [];
        const delivered = deliveries.some((row) => row.messageId === request.message.id);
        log(`bystander request: ${delivered ? 'delivered and silent' : 'narrowed away'}`);
        log(`bystander reactions on the request: ${agentReactions(target, bystander.id).length}`);
        expect(
            await agentPostsSince(kit, channel.id, bystander.id, head),
            'posts from the unaddressed Agent'
        ).toHaveLength(0);
    }),
});

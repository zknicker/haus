// Placement eval S1 ("found the kit"), shared by its Files and workspace
// variants: an earlier "Not yet" about a missing starter kit, then "check
// now!". The Agent should answer inline with what the kit changes: at most a
// pickup note plus one inline `--done` reply naming the seeded rules. Length,
// question count, tails and tone are graded out of band by scripts/eval/grade.mjs.

import {
    expectDoneToRequest,
    expectSharedPlacement,
    findResultPost,
    readPlacement,
} from './placement.mjs';

export const kitRuleTerms = [
    /word[\s-]?span/iu,
    /\b50[\s-]?char/iu,
    /pure[\s-]?(?:black|white)/iu,
    /banned[\s-]?words?/iu,
    /trademark/iu,
];

/** A post names the kit when it carries at least two of its seeded rule terms. */
export function namesKitRules(text) {
    return kitRuleTerms.filter((term) => term.test(text)).length >= 2;
}

export const foundTheKitContract =
    'Told to check again for a starter kit, the Agent answers inline to the exchange with a post naming at least two of the kit’s seeded rules, at most two channel posts, nothing in the request Thread, and a --done send to the channel replying to the exchange.';

/**
 * Seeds the earlier exchange with delivery held (every human message in a
 * one-Agent channel wakes that Agent), places the kit, sends the wake, then
 * releases delivery so one turn reads it all, and gates placement.
 */
export async function runFoundTheKit(
    { agents, expect, kit, log, settleTurn },
    { exchange, placeKit }
) {
    const [worker] = agents;
    const channel = await kit.createChannel({
        agentIds: [worker.id],
        name: `design-factory-${kit.marker('').toLowerCase()}`,
    });
    log('seeding the earlier exchange');
    await kit.trpc('agent.stop', { agentId: worker.id, serverId: kit.serverId });
    try {
        const question = await kit.harness.send(channel.id, exchange.question);
        const notYet = await kit.authorAsAgent(worker.id, `#${channel.name}`, exchange.notYet, {
            chatId: channel.id,
            replyToMessageId: question.message.id,
        });
        await placeKit(worker);
        const wake = await kit.harness.send(channel.id, exchange.wake);
        await kit.trpc('agent.start', { agentId: worker.id, serverId: kit.serverId });

        const turn = await settleTurn(worker.id);
        expect(turn.status, 'turn completed').toBe('completed');
        const requestIds = [question.message.id, wake.message.id];
        const placement = await readPlacement(kit, turn, {
            agentId: worker.id,
            channelId: channel.id,
            requestIds,
        });
        log(
            `posts: ${[...placement.channelPosts, ...placement.threadPosts].map((entry) => entry.label).join(', ') || 'none'}`
        );
        const result = findResultPost(placement.channelPosts, (entry) =>
            namesKitRules(entry.message.content)
        );
        expectSharedPlacement(expect, placement, result);
        // The reply may quote the human's message or the seeded "Not yet"; all
        // three sit in the request's reply chain.
        expectDoneToRequest(expect, placement, {
            requestIds: [...requestIds, notYet.message.id],
        });
        expect(placement.channelPosts.length <= 2, 'at most two channel posts').toBe(true);
    } finally {
        await kit.trpc('agent.start', { agentId: worker.id, serverId: kit.serverId });
    }
}

export const starterKit = `# Pod Folder System Starter Kit

Philip's rules for every design that leaves the factory.

1. Run a trademark word-span check on every title: test each one- to four-word span against the live marks list, not just single words.
2. Titles stay under 50 characters, spaces included.
3. Export artwork as an opaque PNG. No transparency anywhere.
4. Dark garments get pure white (#FFFFFF) art; light garments get pure black (#000000) art. No grays.
5. Banned words never appear in titles, bullets, or tags: best, official, licensed, guaranteed, gift.
6. One niche per design; never stack two audiences in one phrase.
7. Minimum font size is 48 pt at print size.
8. Keep a 0.5 inch safe margin inside the print area.
9. Every design ships with exactly three title variants.
10. Folder layout is niche/design-slug/ with art, mockups, and copy subfolders.
11. File names are kebab-case slugs that match their folder.
12. Nothing ships until a second person signs off on the word-span report.
`;

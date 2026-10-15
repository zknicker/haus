// A natural cloud review request launches one real Cloud Agent work item from
// the requesting channel, as an inline reply to the request, and the Agent
// posts nothing else there (beyond one pickup note before the launch, ADR
// 0029) or in other Threads. The work is then cancelled; the
// provider round trip and the completion wake are Server plumbing, not judgment.
// Asked from a second channel, the Agent links the same work there (ADR 0044):
// its Message carries the printed link, gets the live card, and the launch
// Message stays the work anchor.
//
// Opt-in: it launches a real Cursor run, so the stack needs Cursor access.

import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const terminal = new Set(['completed', 'failed', 'cancelled']);

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'A natural cloud review request launches exactly one Cloud Agent work item from the requesting channel as an inline reply to the request, with nothing else in the channel beyond one pickup note before it and nothing in other Threads, and asked from a second channel the Agent links that same work with its live card while the launch stays the anchor.',
    name: 'cloud-launch-and-link',
    optIn: true,
    run: withRoutingEvidence(async ({ agents, expect, kit, log, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let work;
        try {
            const request = await kit.harness.send(
                channel.id,
                `@${worker.handle} Can you have a cloud agent take a quick look at the README in zknicker/haus on main and tell me what the project does and whether the getting-started instructions seem clear? Just a review; no code changes or PR needed.`
            );
            const launch = await settleTurn(worker.id);
            expect(launch.status, 'launch turn completed').toBe('completed');
            const works = await readCloudWork(kit, channel.id);
            expect(works, 'one real cloud work item').toHaveLength(1);
            [work] = works;
            log(`cloud work ${work.id}: ${work.status}`);
            expect(work.conversationChatId, 'cloud launch in requesting channel').toBe(channel.id);

            const messages = await kit.readMessages(channel.id);
            const anchor = messages.find((message) => message.id === work.anchorMessageId);
            expect(
                anchor?.reply?.rootMessageId,
                'launch Message is an inline reply to the request'
            ).toBe(request.message.id);
            // In the launch turn, the one-line pickup note before the launch is the ADR 0029
            // acknowledgment; anything else is chatter. A fast run may already have woken a
            // later turn with the outcome, which belongs in the channel (ADR 0044).
            const launchRuns = new Set(launch.runIds ?? [launch.runId]);
            const otherPosts = messages.filter(
                (message) =>
                    message.author.kind === 'agent' &&
                    message.author.agentId === worker.id &&
                    message.id !== work.anchorMessageId &&
                    (!message.runId || launchRuns.has(message.runId))
            );
            const pickupNotes = otherPosts.filter((message) => message.sequence < anchor?.sequence);
            expect(pickupNotes.length <= 1, 'at most one pickup note before the launch').toBe(true);
            expect(
                otherPosts.filter((message) => message.sequence > anchor?.sequence),
                'launch-turn channel posts after the launch'
            ).toHaveLength(0);
            const workThreadId = await findWorkThread(kit, channel.id, work);
            expect(
                await countPostsInOtherThreads(kit, {
                    agentId: worker.id,
                    channelId: channel.id,
                    workThreadId,
                }),
                'Agent posts in Threads other than the work Thread'
            ).toBe(0);

            await cancelUnfinished(kit, channel.id, log);

            const second = await kit.createChannel({ agentIds: [worker.id] });
            await kit.harness.send(
                second.id,
                `@${worker.handle} Can you link the cloud agent work you started on the zknicker/haus README here, so this team can follow it?`
            );
            const linkTurn = await settleTurn(worker.id, { startWithin: 90_000 });
            expect(linkTurn.status, 'link turn completed').toBe('completed');
            const linking = (await kit.readMessages(second.id)).filter(
                (message) =>
                    message.author.agentId === worker.id &&
                    message.content.includes(`cloud-agent://${work.id}`)
            );
            expect(linking.length > 0, 'second channel message links the work').toBe(true);
            expect(
                linking.some((message) =>
                    (message.cloudAgentWork ?? []).some((linked) => linked.id === work.id)
                ),
                'linked work renders its card in the second channel'
            ).toBe(true);
            expect(
                (await readCloudWork(kit, channel.id))[0]?.anchorMessageId,
                'launch message stays the work anchor'
            ).toBe(work.anchorMessageId);
        } finally {
            if (work) {
                await cancelUnfinished(kit, channel.id, log);
            }
        }
    }),
});

/**
 * The single adapter over today's Cloud Agent work shape: one work per launch
 * Message, listed by its requesting Chat. The listing has a row per Message that
 * carries the work, so a later outcome post that links it repeats the work.
 */
async function readCloudWork(kit, chatId) {
    const entries = await kit.trpc('cloudAgentWork.listForChat', {
        chatId,
        serverId: kit.serverId,
    });
    const works = new Map(
        entries.map(({ work }) => [
            work.id,
            {
                anchorMessageId: work.messageId,
                conversationChatId: work.chatId,
                id: work.id,
                status: work.status,
            },
        ])
    );
    return [...works.values()];
}

async function cancelUnfinished(kit, chatId, log) {
    const [work] = await readCloudWork(kit, chatId);
    if (work && !terminal.has(work.status)) {
        await kit.trpc('cloudAgentWork.cancel', { serverId: kit.serverId, workId: work.id });
        log(`requested cancellation of cloud work ${work.id}`);
    }
}

/** The Thread anchored on the work's Message in the requesting channel, if any. */
async function findWorkThread(kit, channelId, work) {
    const threads = await listThreads(kit, channelId);
    return threads.find((thread) => thread.anchorMessageId === work.anchorMessageId)?.threadChatId;
}

async function countPostsInOtherThreads(kit, { agentId, channelId, workThreadId }) {
    let count = 0;
    for (const thread of await listThreads(kit, channelId)) {
        await kit.trackChat(thread.threadChatId);
        if (thread.threadChatId === workThreadId) {
            continue;
        }
        count += kit.authoredBy(await kit.readMessages(thread.threadChatId), agentId).length;
    }
    return count;
}

async function listThreads(kit, chatId) {
    const { threads } = await kit.trpc('chat.messages', {
        chatId,
        limit: 100,
        serverId: kit.serverId,
    });
    return threads;
}

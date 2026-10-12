import { sleep } from '../../eval-harness.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

const terminal = new Set(['completed', 'failed', 'cancelled']);

export default defineScenario({
    agents: [{ kind: 'coordinator' }],
    contract:
        'A natural cloud review request launches real work with its own Thread; review chatter stays in that work Thread, completion wakes the coordinator to bring a concise outcome back to the requesting channel, and a human reply in the work Thread is answered there.',
    name: 'cloud-conversation-handoff',
    optIn: true,
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let work;
        try {
            await kit.harness.send(
                channel.id,
                `@${worker.handle} Can you have a cloud agent take a quick look at the README in zknicker/haus on main and tell me what the project does and whether the getting-started instructions seem clear? Just a review; no code changes or PR needed.`
            );
            const launch = await settleTurn(worker.id);
            const works = await readCloudWork(kit, channel.id);
            expect(works, 'one real cloud work item').toHaveLength(1);
            [work] = works;
            log(`cloud work ${work.id}: ${work.status}`);
            expect(launch.status, 'launch turn completed').toBe('completed');
            expect(work.conversationChatId, 'cloud launch in requesting channel').toBe(channel.id);

            // (a) The work Message gets its Thread at launch, before any reply lands in it.
            const workThreadId = await findWorkThread(kit, channel.id, work);
            expect(Boolean(workThreadId), 'work thread exists at launch').toBe(true);
            await kit.trackChat(workThreadId);
            const launchSequence = await messageSequence(kit, channel.id, work.anchorMessageId);

            const known = new Set(launch.runIds);
            const deadline = Date.now() + 15 * 60_000;
            let lastStatus = work.status;
            let resumed;
            while (Date.now() < deadline) {
                [work] = await readCloudWork(kit, channel.id);
                if (work.status !== lastStatus) {
                    log(`cloud work ${work.id}: ${work.status}`);
                    lastStatus = work.status;
                }
                const turns = await kit.turns.listTurns(worker.id);
                const state = await kit.turns.deliveryState(worker.id);
                resumed = turns.find((turn) => !known.has(turn.runId) && turn.endedAt);
                if (terminal.has(work.status) && resumed && !state.running && state.pending === 0) {
                    break;
                }
                await sleep(2000);
            }
            expect(work.status, 'provider completed successfully').toBe('completed');
            expect(Boolean(resumed), 'completion woke coordinator').toBe(true);

            // (b) After launch the channel hears only the outcome; detail goes in the work Thread.
            const messages = await kit.readMessages(channel.id);
            const ownTopLevel = messages.filter(
                (message) =>
                    message.author.kind === 'agent' &&
                    message.author.agentId === worker.id &&
                    message.sequence > launchSequence
            );
            const terminalAt = Date.parse(work.terminalAt);
            const chatter = ownTopLevel.filter(
                (message) => Date.parse(message.createdAt) < terminalAt
            );
            const outcomes = ownTopLevel.filter(
                (message) => Date.parse(message.createdAt) >= terminalAt
            );
            const threadPosts = kit.authoredBy(await kit.readMessages(workThreadId), worker.id);
            const strayThreadPosts = await countPostsInOtherThreads(kit, {
                agentId: worker.id,
                channelId: channel.id,
                workThreadId,
            });
            log(
                `channel after launch: ${chatter.length} mid-work, ${outcomes.length} outcome; work thread: ${threadPosts.length}; other threads: ${strayThreadPosts}`
            );
            expect(chatter, 'no channel chatter while work runs').toHaveLength(0);
            expect(strayThreadPosts, 'no agent posts in threads other than the work thread').toBe(
                0
            );
            expect(outcomes.length > 0, 'outcome returned to requester').toBe(true);
            // One requester line per real state change; review detail stays in the work thread.
            expect(outcomes.length <= 2, 'concise outcome in requesting channel').toBe(true);
            expect(
                outcomes.some(
                    (message) =>
                        (work.providerUrl && message.content.includes(work.providerUrl)) ||
                        /\]\([^)]+\)/u.test(message.content)
                ),
                'outcome links to work'
            ).toBe(true);

            // (c) An unmentioned human reply in the work Thread wakes the Agent (it follows the
            // Thread) and is answered in that Thread, not the channel.
            const token = marker('WORKTHREAD');
            const threadHead = await kit.readHead(workThreadId);
            const channelHead = await kit.readHead(channel.id);
            await kit.sendInThread(
                channel.id,
                work.anchorMessageId,
                `Thanks for this. Quick follow-up here: in one line, what is the first command the README tells a new contributor to run? Answer from what you already have, no need to send the cloud agent back out, and include ${token}.`
            );
            const followUp = await settleTurn(worker.id, { startWithin: 90_000 });
            expect(followUp.status, 'thread follow-up turn completed').toBe('completed');
            expect(
                kit.authoredBy(await kit.readMessages(workThreadId), worker.id, threadHead),
                'thread follow-up answered in the work thread'
            ).toContain(token);
            expect(
                kit.authoredBy(await kit.readMessages(channel.id), worker.id, channelHead),
                'thread follow-up adds nothing to the channel'
            ).toHaveLength(0);

            // (d) Asked from a second channel, the Agent links the same work there (ADR 0044):
            // its Message carries the printed link, gets the live card, and the launch stays put.
            const second = await kit.createChannel({ agentIds: [worker.id] });
            await kit.harness.send(
                second.id,
                `@${worker.handle} Can you link the cloud agent work you ran on the zknicker/haus README here, so this team can follow it?`
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
                (await readCloudWork(kit, second.id)).map(({ id }) => id),
                'second channel lists the linked work'
            ).toContain(work.id);
            expect(
                (await readCloudWork(kit, channel.id))[0]?.anchorMessageId,
                'launch message stays the work anchor'
            ).toBe(work.anchorMessageId);
        } finally {
            // The thread follow-up may have sent the work back out; cancel from a fresh read.
            if (work) {
                [work] = await readCloudWork(kit, channel.id);
            }
            if (work && !terminal.has(work.status)) {
                await kit.trpc('cloudAgentWork.cancel', {
                    serverId: kit.serverId,
                    workId: work.id,
                });
                log(`requested cancellation of unfinished smoke work ${work.id}`);
            }
        }
    }),
});

/**
 * The single adapter over today's Cloud Agent work shape: one work per launch
 * Message, listed by its requesting Chat. When the job record decouples from
 * its launch Message, swap this read and keep the scenario's assertions.
 */
async function readCloudWork(kit, chatId) {
    const entries = await kit.trpc('cloudAgentWork.listForChat', {
        chatId,
        serverId: kit.serverId,
    });
    return entries.map(({ work }) => ({
        anchorMessageId: work.messageId,
        conversationChatId: work.chatId,
        id: work.id,
        providerUrl: work.providerUrl,
        status: work.status,
        terminalAt: work.terminalAt,
    }));
}

/** The Thread anchored on the work's Message in the requesting channel. */
async function findWorkThread(kit, channelId, work) {
    const threads = await listThreads(kit, channelId);
    return threads.find((thread) => thread.anchorMessageId === work.anchorMessageId)?.threadChatId;
}

async function countPostsInOtherThreads(kit, { agentId, channelId, workThreadId }) {
    let count = 0;
    for (const thread of await listThreads(kit, channelId)) {
        if (thread.threadChatId === workThreadId) {
            continue;
        }
        await kit.trackChat(thread.threadChatId);
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

async function messageSequence(kit, chatId, messageId) {
    const message = (await kit.readMessages(chatId)).find((entry) => entry.id === messageId);
    if (!message) {
        throw new Error(`launch message ${messageId} is not in chat ${chatId}`);
    }
    return message.sequence;
}

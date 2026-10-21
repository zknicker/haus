// A reminder fires while its owner is busy in a live Thread exchange. The
// Owner asks the first Agent for a one-minute follow-up in the channel, then,
// while the reminder is pending, opens a Thread on a different message and asks
// that Agent two quick questions there, the second timed to land with the fire.
// The Manual card `reminder-cron` says a fire is answered top level in the
// anchor chat with `--cause <fireId>` and never in a Thread. Decoy: the live
// Thread is the conversation in front of the Agent, so it answers the fire
// inside that Thread or folds the status into its Thread reply. A second Agent
// in the channel stays silent throughout.

import { expectSettled, journaledSends, ownerSend, postsAcrossChannel, wait } from '../room-c.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'A reminder that fires while its owner is mid-exchange in a live Thread is answered by exactly one reminder-caused message in the anchor chat, attributed with --cause, never inside the live Thread; both Thread questions are answered in the Thread, and the second Agent writes nothing.',
    name: 'room-reminder-fires-mid-conversation',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker, bystander] = agents;
        const token = marker('READY');
        const channel = await kit.createChannel({ agentIds: [worker.id, bystander.id] });
        const head = await kit.readHead(channel.id);
        let reminder = null;

        try {
            log('asking for the follow-up');
            await ownerSend(
                kit,
                channel.id,
                `Release status board ${kit.stamp}. Release status: PENDING.`
            );
            await ownerSend(
                kit,
                channel.id,
                `@${worker.handle} In 60 seconds, revisit this channel and report the most recent "Release status:" line verbatim. Schedule the follow-up; do not keep this turn alive while waiting.`
            );
            expectSettled(expect, await settleTurn(worker.id), 'scheduling turn');

            reminder = await waitForScheduledReminder(kit, worker.id, channel.id);
            expect(reminder?.id, 'a scheduled reminder anchored to this conversation').toBeTruthy();
            expect(reminder.repeat ?? 'none', 'reminder repeat').toBe('none');
            await ownerSend(kit, channel.id, `Release status: ${token}`);

            log('opening a live Thread on a different message');
            const anchor = await ownerSend(kit, channel.id, `Launch email list ${kit.stamp}`);
            const threadHead = await kit.readHead(channel.id);
            const opened = await ownerSend(
                kit,
                channel.id,
                `@${worker.handle} Quick one while we're here: 17 segments of 23 recipients each, how many recipients total?`,
                { thread: { anchorMessageId: anchor.message.id } }
            );
            const liveThreadId = opened.threadChatId;
            expect(liveThreadId, 'live Thread chat id on the send receipt').toBeTruthy();
            await kit.trackChat(liveThreadId);
            expect(liveThreadId === reminder.anchorChatId, 'live Thread is the anchor').toBe(false);
            expectSettled(expect, await settleTurn(worker.id), 'first Thread turn');

            const untilFire = Date.parse(reminder.fireAt) - Date.now();
            log(
                untilFire > 0
                    ? `holding ${Math.round(untilFire / 1000)}s for the fire`
                    : 'fire already due'
            );
            await wait(Math.max(0, untilFire - 2000));
            await ownerSend(kit, channel.id, 'And with 19 segments instead?', {
                thread: { anchorMessageId: anchor.message.id },
            });

            log('waiting for the fire and the Thread answer');
            const fire = await waitForFire(kit, reminder.id);
            expect(fire?.id, 'the reminder fired').toBeTruthy();
            await kit.harness.waitForAgentQuiet(worker.id, 15_000, 300_000);
            await kit.harness.waitForAgentQuiet(bystander.id, 10_000, 300_000);

            log('checking gates');
            const posts = await postsAcrossChannel(kit, channel.id, worker.id, head);
            const caused = posts.filter(
                (message) =>
                    message.cause?.kind === 'reminder' && message.cause.automationId === reminder.id
            );
            expect(caused, 'reminder-caused posts across the channel and its Threads').toHaveLength(
                1
            );
            const [answer] = caused;
            expect(answer.chatId, 'the fire answer lands in the anchor chat').toBe(
                reminder.anchorChatId
            );
            expect(answer.content, 'the fire answer reports the newest status').toContain(token);
            expect(answer.cause.fireId, 'the fire answer names the fire').toBe(fire.id);
            expect(answer.cause.attribution, 'the fire named with --cause').toBe('explicit');

            const inThread = posts.filter((message) => message.chatId === liveThreadId);
            expect(
                inThread.filter((message) => message.content.includes(token)),
                'live Thread posts carrying the reminder status'
            ).toHaveLength(0);
            expect(
                inThread.filter((message) => message.content.includes('391')),
                'first Thread answer in the live Thread'
            ).toHaveLength(1);
            expect(
                inThread.filter((message) => message.content.includes('437')),
                'second Thread answer in the live Thread'
            ).toHaveLength(1);
            expect(
                posts.filter(
                    (message) =>
                        message.chatId === channel.id &&
                        message.sequence > threadHead &&
                        message.id !== answer.id
                ),
                'top-level channel posts after the Thread opened, besides the fire answer'
            ).toHaveLength(0);

            const { sends, unavailable } = await journaledSends(kit, worker.id);
            const causeSends = sends.filter(
                ({ command }) => /--cause[\s=]/u.test(command) && command.includes(fire.id)
            );
            if (causeSends.length === 0 && unavailable.length > 0) {
                throw new Error(
                    `Execution journals never synced for runs ${unavailable.join(', ')}.`
                );
            }
            expect(
                causeSends.length > 0,
                'a journaled haus message send carrying --cause <fireId>'
            ).toBe(true);

            expect(
                await postsAcrossChannel(kit, channel.id, bystander.id, head),
                'posts from the second Agent'
            ).toHaveLength(0);
        } finally {
            await cancelIfScheduled(kit, reminder);
        }
    }),
});

/** The Agent may anchor its reminder to the channel itself or to a Thread in it. */
async function waitForScheduledReminder(kit, agentId, channelId) {
    const deadline = Date.now() + 120_000;
    for (;;) {
        const page = await kit.trpc('chat.messages', {
            chatId: channelId,
            limit: 100,
            serverId: kit.serverId,
        });
        const anchors = new Set([
            channelId,
            ...(page.threads ?? []).map((thread) => thread.threadChatId),
        ]);
        const reminders = await kit.trpc('reminder.list', {
            agentId,
            serverId: kit.serverId,
            status: 'scheduled',
        });
        const scheduled = reminders.find((candidate) => anchors.has(candidate.anchorChatId));
        if (scheduled || Date.now() >= deadline) {
            if (scheduled && scheduled.anchorChatId !== channelId) {
                await kit.trackChat(scheduled.anchorChatId);
            }
            return scheduled ?? null;
        }
        await wait(2000);
    }
}

async function waitForFire(kit, reminderId) {
    const deadline = Date.now() + 200_000;
    for (;;) {
        const runs = await kit.trpc('reminder.runs', { reminderId, serverId: kit.serverId });
        if (runs.length > 0 || Date.now() >= deadline) {
            return runs[0] ?? null;
        }
        await wait(2000);
    }
}

async function cancelIfScheduled(kit, reminder) {
    if (!reminder) {
        return;
    }
    await kit
        .trpc('reminder.list', {
            agentId: reminder.ownerAgentId,
            serverId: kit.serverId,
            status: 'scheduled',
        })
        .then(async (rows) => {
            const current = rows.find((row) => row.id === reminder.id);
            if (!current) {
                return;
            }
            await kit.trpc('reminder.cancel', {
                commandId: `agent-tests-cleanup-${kit.stamp}`,
                expectedVersion: current.version,
                reminderId: current.id,
                serverId: kit.serverId,
            });
        })
        .catch(() => undefined);
}

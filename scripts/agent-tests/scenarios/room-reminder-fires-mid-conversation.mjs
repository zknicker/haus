// Owner asks the first Agent for a one-minute follow-up in the channel, then,

import { expectSettled, journaledSends, ownerSend, postsAcrossChannel, wait } from '../room-c.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }, { kind: 'worker' }],
    contract:
        'A reminder that fires while its owner is mid-exchange in a live inline exchange is answered by exactly one reminder-caused top-level message in the anchor chat, attributed with --cause, never inside the inline exchange; both inline questions are answered inline, and the second Agent writes nothing.',
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

            log('opening a live inline exchange under a different message');
            const anchor = await ownerSend(kit, channel.id, `Launch email list ${kit.stamp}`);
            const exchangeHead = await kit.readHead(channel.id);
            await ownerSend(
                kit,
                channel.id,
                `@${worker.handle} Quick one while we're here: 17 segments of 23 recipients each, how many recipients total?`,
                { replyToMessageId: anchor.message.id }
            );
            expectSettled(expect, await settleTurn(worker.id), 'first inline turn');

            const untilFire = Date.parse(reminder.fireAt) - Date.now();
            log(
                untilFire > 0
                    ? `holding ${Math.round(untilFire / 1000)}s for the fire`
                    : 'fire already due'
            );
            await wait(Math.max(0, untilFire - 2000));
            await ownerSend(kit, channel.id, 'And with 19 segments instead?', {
                replyToMessageId: anchor.message.id,
            });

            log('waiting for the fire and the inline answer');
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
            expect(caused, 'reminder-caused posts in the channel').toHaveLength(1);
            const [answer] = caused;
            expect(answer.chatId, 'the fire answer lands in the anchor chat').toBe(
                reminder.anchorChatId
            );
            expect(answer.reply ?? null, 'the fire answer is a new top-level message').toBe(null);
            expect(answer.content, 'the fire answer reports the newest status').toContain(token);
            expect(answer.cause.fireId, 'the fire answer names the fire').toBe(fire.id);
            expect(answer.cause.attribution, 'the fire named with --cause').toBe('explicit');

            const inExchange = posts.filter(
                (message) => message.reply?.rootMessageId === anchor.message.id
            );
            expect(
                inExchange.filter((message) => message.content.includes(token)),
                'inline exchange posts carrying the reminder status'
            ).toHaveLength(0);
            expect(
                inExchange.filter((message) => message.content.includes('391')),
                'first inline answer in the exchange'
            ).toHaveLength(1);
            expect(
                inExchange.filter((message) => message.content.includes('437')),
                'second inline answer in the exchange'
            ).toHaveLength(1);
            expect(
                posts.filter(
                    (message) =>
                        message.sequence > exchangeHead &&
                        message.id !== answer.id &&
                        message.reply?.rootMessageId !== anchor.message.id
                ),
                'channel posts after the exchange opened, besides the fire answer and the inline answers'
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

async function waitForScheduledReminder(kit, agentId, channelId) {
    const deadline = Date.now() + 120_000;
    for (;;) {
        const reminders = await kit.trpc('reminder.list', {
            agentId,
            serverId: kit.serverId,
            status: 'scheduled',
        });
        const scheduled = reminders.find((candidate) => candidate.anchorChatId === channelId);
        if (scheduled || Date.now() >= deadline) {
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

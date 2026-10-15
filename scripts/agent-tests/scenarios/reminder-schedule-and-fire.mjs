// An Agent asked to check back later must schedule a real reminder instead of
// holding its turn open, and when that reminder fires it must reread the chat,
// report the newest business state exactly once, and attribute that message to
// the fire. The fire itself never writes a Chat receipt.

import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An Agent asked for a 30-second follow-up schedules one non-repeating reminder anchored to the conversation, ends its turn, and reports the status line that arrived while it was away in exactly one reminder-caused message.',
    name: 'reminder-schedule-and-fire',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [worker] = agents;
        const token = marker('STATUS');
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        let reminder = null;

        try {
            log('asking for the follow-up');
            await kit.harness.send(
                channel.id,
                `Deployment status board ${kit.stamp}. Current status: PENDING.`
            );
            await kit.harness.send(
                channel.id,
                `@${worker.handle} In 30 seconds, revisit this channel and report the most recent "Deployment status:" line verbatim. Schedule the follow-up; do not keep this turn alive while waiting.`
            );

            const scheduling = await settleTurn(worker.id);
            expect(scheduling.status, 'scheduling turn status').toBe('completed');
            expect(scheduling.failureKind ?? 'none', 'scheduling turn failure kind').toBe('none');

            log('reading the scheduled reminder');
            reminder = await waitForScheduledReminder(kit, worker.id, channel.id);
            expect(reminder?.id, 'a scheduled reminder anchored to this conversation').toBeTruthy();
            expect(reminder.ownerAgentId, 'reminder owner').toBe(worker.id);
            expect(reminder.repeat ?? 'none', 'reminder repeat').toBe('none');

            const anchorChatId = reminder.anchorChatId;
            if (anchorChatId !== channel.id) {
                await kit.trackChat(anchorChatId);
            }

            const fresh = `Deployment status: READY-${token}`;
            await kit.harness.send(channel.id, fresh);
            if (anchorChatId !== channel.id) {
                await kit.harness.send(anchorChatId, fresh);
            }

            log('waiting for the reminder to fire');
            const earlyReports = (await readAgentReplies(kit, anchorChatId, worker.id)).filter(
                (message) => message.content.includes(`READY-${token}`)
            );
            expect(earlyReports, 'follow-up reports before the reminder fired').toHaveLength(0);

            const reported = await kit.awaitAgentReply(
                anchorChatId,
                worker.id,
                (message) =>
                    message.content.includes(`READY-${token}`) &&
                    message.cause?.kind === 'reminder' &&
                    message.cause.automationId === reminder.id,
                200_000
            );
            const report = reported.message;
            expect(report.content, 'the follow-up report').toContain(`READY-${token}`);
            expect(report.cause?.fireId, 'the reminder fire attribution').toBeTruthy();

            log('checking gates');
            const reports = (await readAgentReplies(kit, anchorChatId, worker.id)).filter(
                (message) =>
                    message.content.includes(`READY-${token}`) &&
                    message.cause?.kind === 'reminder' &&
                    message.cause.automationId === reminder.id
            );
            expect(
                reports,
                'follow-up reports across the anchor and its task Threads'
            ).toHaveLength(1);
        } finally {
            await cancelIfScheduled(kit, reminder);
        }
    },
});

async function readAgentReplies(kit, chatId, agentId) {
    const direct = await kit.readMessages(chatId);
    const { tasks } = await kit.trpc('task.list', { serverId: kit.serverId });
    const threads = await Promise.all(
        tasks
            .filter((entry) => entry.task.chatId === chatId)
            .map((entry) => kit.readMessages(entry.task.threadChatId))
    );
    return [...direct, ...threads.flat()].filter(
        (message) => message.author.kind === 'agent' && message.author.agentId === agentId
    );
}

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
            return scheduled ?? null;
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

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

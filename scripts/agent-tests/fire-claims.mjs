import { cancelReminder, fireReminderNow, scheduleAgentReminder } from './task-intake-events.mjs';
import { settleIfStarted } from './task-intake.mjs';

export async function claimsCreatedBy(kit, agentId) {
    const { claims } = await kit.trpc('claim.list', {
        includeBackground: true,
        serverId: kit.serverId,
    });
    return claims.filter((entry) => entry.claim.createdByAgentId === agentId);
}

export async function fireStatusCheck(kit, { boardLine, settleTurn, worker }) {
    const channel = await kit.createChannel({ agentIds: [worker.id] });
    const anchor = await kit.harness.send(
        channel.id,
        `FYI, no reply needed. Status board ${kit.stamp}: ${boardLine}`
    );
    await settleIfStarted(settleTurn, worker.id);
    const reminder = await scheduleAgentReminder(kit, {
        agentId: worker.id,
        chatId: channel.id,
        description:
            'Read the latest status board line in this channel. If the build is red, post one line naming the red build and its token. If it is green, stay quiet.',
        messageId: anchor.message.id,
        title: 'Build status check',
    });
    const head = await kit.readHead(channel.id);
    const claimsBefore = (await claimsCreatedBy(kit, worker.id)).length;
    try {
        const fired = await fireReminderNow(kit, { agentId: worker.id, reminder, settleTurn });
        return { ...fired, channel, claimsBefore, head, reminder };
    } catch (error) {
        await cancelReminder(kit, reminder, worker.id);
        throw error;
    }
}

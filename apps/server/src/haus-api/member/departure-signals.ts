import { publishChatComposition } from '../../chats/composition-hub.ts';
import { createOpaqueId } from '../../postgres/opaque-id.ts';
import { memberUpdatedTopic, serverUpdatedTopic } from '../../realtime/topics.ts';
import type { RemovedServerMember } from '../../servers/remove-member.ts';

/**
 * Announces a departure after the removal has committed. Nothing here is
 * durable: composition is a live-only signal, so a cleared draft that never
 * reaches a listener simply disappears, which is what composition already does.
 * Signalling before commit could advertise a departure that rolls back.
 *
 * A `null` composition retires that human's draft wherever it is still shown.
 * The App also filters humans who have left the member directory, so a missed
 * signal cannot leave a former member composing forever.
 */
export function announceDeparture(departure: RemovedServerMember): void {
    for (const chatId of departure.departedChatIds) {
        publishChatComposition({
            actorUserId: departure.userId,
            chatId,
            compositionId: createOpaqueId('cmp'),
            emittedAt: new Date().toISOString(),
            serverId: departure.serverId,
            text: null,
        });
    }

    memberUpdatedTopic.announce({ memberId: departure.userId, serverId: departure.serverId });
    // The membership sentinel: the departed member's `server.onUpdated` rechecks
    // and ends with `membership_lost`.
    serverUpdatedTopic.announce({ serverId: departure.serverId });
}

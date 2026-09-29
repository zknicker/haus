import type { ServerDurableEvent } from '@haus/api';
import { subscribeToDurableChatEvents } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { deletePushDevice, listPushDevices, recordPushDeviceError } from './push-devices.ts';
import { buildPushPayload } from './push-payload.ts';
import { createPushQueue } from './push-queue.ts';
import { readPushRecipients } from './push-recipients.ts';
import type { PushSender } from './push-sender.ts';

type MessageCreatedEvent = Extract<ServerDurableEvent, { type: 'message.created' }>;

export interface MessagePush {
    /** Stops listening and waits for pushes already in flight. */
    close(): Promise<void>;
}

/** Enough to absorb an idempotent replay re-emitting a recent message. */
const rememberedMessages = 1000;
/** Messages pushed at once; each reads Needs you and sends to every device. */
const pushConcurrency = 4;
const pushBacklog = 1000;

/**
 * iPhone push for Needs you (ADR 0037). It listens to the same post-commit
 * durable events realtime clients do, and for each `message.created` pushes
 * every human the message newly addresses: one alert per device per message,
 * sent off the send path. Failures are logged and recorded on the device;
 * they never reach the sender of the message.
 */
export function startMessagePush(db: HausDatabase, sender: PushSender): MessagePush {
    const abort = new AbortController();
    const queue = createPushQueue({ concurrency: pushConcurrency, maxBacklog: pushBacklog });
    const seen = new Set<string>();

    const track = (event: MessageCreatedEvent) => {
        if (seen.has(event.messageId)) {
            return;
        }
        seen.add(event.messageId);
        if (seen.size > rememberedMessages) {
            seen.delete(seen.values().next().value as string);
        }
        const queued = queue.enqueue(() =>
            pushMessage(db, sender, event).catch((error: unknown) => {
                console.warn(
                    '[haus] iPhone push failed for a message',
                    error instanceof Error ? error.name : 'unknown error'
                );
            })
        );
        if (!queued) {
            console.warn('[haus] iPhone push backlog full; dropped a message push');
        }
    };

    const listening = (async () => {
        try {
            for await (const { event } of subscribeToDurableChatEvents(abort.signal)) {
                if (event.type === 'message.created') {
                    track(event);
                }
            }
        } catch (error) {
            if (!abort.signal.aborted) {
                console.error(
                    '[haus] iPhone push stopped listening for messages',
                    error instanceof Error ? error.message : 'unknown error'
                );
            }
        }
    })();

    return {
        async close() {
            abort.abort();
            await listening;
            await queue.drain();
            await sender.close();
        },
    };
}

/** Pushes one message to every human whose Needs you it newly tops. Exported for tests. */
export async function pushMessage(
    db: HausDatabase,
    sender: PushSender,
    event: MessageCreatedEvent
): Promise<void> {
    const recipients = await readPushRecipients(db, event);
    for (const recipient of recipients) {
        const payload = buildPushPayload(recipient.row, {
            badge: recipient.badge,
            serverId: event.serverId,
        });
        for (const device of await listPushDevices(db, recipient.userId)) {
            const outcome = await sender.send({ collapseId: event.messageId, device, payload });
            if (outcome.kind === 'device-gone') {
                await deletePushDevice(db, device.token);
            } else if (outcome.kind === 'rejected') {
                console.warn(
                    `[haus] APNs refused a push to device …${device.token.slice(-6)}: ${outcome.status ?? 'no status'} ${outcome.reason}`
                );
                await recordPushDeviceError(
                    db,
                    device.token,
                    `${outcome.status ?? 'transport'} ${outcome.reason}`
                );
            }
        }
    }
}

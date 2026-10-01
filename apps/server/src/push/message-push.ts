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

export interface MessagePushOptions {
    /** The App origin avatar URLs in a push are absolute against. */
    appOrigin: string;
}

/** Enough to absorb an idempotent replay re-emitting a recent message. */
const rememberedMessages = 1000;
/** Messages pushed at once; each reads its recipients and sends to every device. */
const pushConcurrency = 4;
const pushBacklog = 1000;

/**
 * iPhone push for new messages (ADR 0038). It listens to the same post-commit
 * durable events realtime clients do, and for each `message.created` pushes
 * every human the shared notification rule names: one alert per device per message,
 * sent off the send path. Failures are logged and recorded on the device;
 * they never reach the sender of the message.
 */
export function startMessagePush(
    db: HausDatabase,
    sender: PushSender,
    options: MessagePushOptions
): MessagePush {
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
            pushMessage(db, sender, event, options).catch((error: unknown) => {
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

/** Pushes one message to every human it notifies. Exported for tests. */
export async function pushMessage(
    db: HausDatabase,
    sender: PushSender,
    event: MessageCreatedEvent,
    options: MessagePushOptions
): Promise<void> {
    const read = await readPushRecipients(db, event);
    if (!read) {
        return;
    }
    for (const recipient of read.recipients) {
        const payload = buildPushPayload(read.message, {
            appOrigin: options.appOrigin,
            badge: recipient.badge,
            reason: recipient.reason,
            serverId: event.serverId,
        });
        if (!payload) {
            console.warn(
                '[haus] iPhone push skipped a message with no resolvable author or Channel'
            );
            continue;
        }
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

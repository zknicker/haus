import type { RealtimeDelivery, RealtimeTopic } from '../src/realtime/topic.ts';
import * as topics from '../src/realtime/topics.ts';

/**
 * Records what one realtime topic publishes, from the moment it is created, so
 * a test can act first and then assert what the Server announced. The
 * harness runs the Server in-process, so this hears exactly what every
 * subscription procedure hears, before any access filtering.
 */
export interface TopicCapture<Event> {
    readonly deliveries: RealtimeDelivery<Event>[];
    readonly events: Event[];
    /** Resolves with the next matching event published after the last one read. */
    next(match?: (event: Event) => boolean, timeoutMs?: number): Promise<Event>;
    stop(): void;
}

export function captureTopic<Event>(topic: RealtimeTopic<Event>): TopicCapture<Event> {
    const controller = new AbortController();
    const deliveries: RealtimeDelivery<Event>[] = [];
    const waiters = new Set<() => void>();
    let cursor = 0;

    const listening = (async () => {
        try {
            for await (const delivery of topic.subscribe(controller.signal)) {
                deliveries.push(delivery);
                for (const wake of waiters) {
                    wake();
                }
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                throw error;
            }
        }
    })();
    listening.catch(() => undefined);

    const take = (match: (event: Event) => boolean) => {
        while (cursor < deliveries.length) {
            const delivery = deliveries[cursor];
            cursor += 1;
            if (delivery && match(delivery.event)) {
                return delivery;
            }
        }
        return null;
    };

    return {
        deliveries,
        get events() {
            return deliveries.map((delivery) => delivery.event);
        },
        next(match = () => true, timeoutMs = 5000) {
            return new Promise<Event>((resolve, reject) => {
                const check = () => {
                    const found = take(match);
                    if (found) {
                        waiters.delete(check);
                        clearTimeout(timer);
                        resolve(found.event);
                    }
                };
                const timer = setTimeout(() => {
                    waiters.delete(check);
                    reject(new Error(`No matching ${topic.name} event within ${timeoutMs}ms.`));
                }, timeoutMs);
                waiters.add(check);
                check();
            });
        },
        stop() {
            controller.abort();
        },
    };
}

export interface RealtimePublication {
    audienceUserId: string | null;
    event: unknown;
    topic: string;
}

/**
 * Records every topic at once, for "publishes exactly this topic" assertions.
 * Cross-topic order is not meaningful (each topic delivers on its own), so
 * `published()` groups by topic name.
 */
export function captureAllTopics() {
    const captures = Object.values(topics).map((topic) => ({
        capture: captureTopic(topic as RealtimeTopic<unknown>),
        name: (topic as RealtimeTopic<unknown>).name,
    }));
    const offsets = new Map<string, number>();
    return {
        /** Forgets everything published so far. */
        clear() {
            for (const { capture, name } of captures) {
                offsets.set(name, capture.deliveries.length);
            }
        },
        published(): RealtimePublication[] {
            return captures
                .toSorted((left, right) => left.name.localeCompare(right.name))
                .flatMap(({ capture, name }) =>
                    capture.deliveries.slice(offsets.get(name) ?? 0).map((delivery) => ({
                        audienceUserId: delivery.audienceUserId,
                        event: delivery.event,
                        topic: name,
                    }))
                );
        },
        stop() {
            for (const { capture } of captures) {
                capture.stop();
            }
        },
        /** Distinct topic names published since the last `clear()`, sorted. */
        topics() {
            return [...new Set(this.published().map((publication) => publication.topic))].sort();
        },
    };
}

/**
 * Everything published since `capture` started (or was cleared), once in-flight
 * deliveries drain, as `{ ...event, type: topicName }`, optionally one Server's
 * only. Grouped by topic, in publish order within each topic.
 */
export async function publishedSince(
    capture: ReturnType<typeof captureAllTopics>,
    serverId?: string
): Promise<Array<Record<string, unknown> & { type: string }>> {
    await settleRealtime();
    return capture
        .published()
        .map(({ event, topic }) => ({ ...(event as Record<string, unknown>), type: topic }))
        .filter((event) => serverId === undefined || event.serverId === serverId);
}

/**
 * What was published about one message, as `message.created`, `task.created`,
 * `task.updated`, or the topic name: messages before tasks, each in publish order.
 */
export async function publishedKinds(
    capture: ReturnType<typeof captureAllTopics>,
    messageId: string
): Promise<string[]> {
    await settleRealtime();
    return capture
        .published()
        .filter(({ event }) => (event as { messageId?: string }).messageId === messageId)
        .map(({ event, topic }) =>
            topic === 'task.changed' ? `task.${(event as { kind: string }).kind}` : topic
        );
}

/** Lets in-flight publishes drain: topic delivery is async iteration. */
export async function settleRealtime() {
    await new Promise((resolve) => setTimeout(resolve, 20));
}

import type {
    ModelConnectionCapacityWindow,
    ModelProvider,
    RunnerConnectionCapacityFrame,
    RunnerModelConnection,
} from '@haus/api';
import type { RunnerLink } from '../run-context.ts';
import type { ConnectionBook } from './connection-book.ts';
import {
    type CapacityUsageUrls,
    readFailure,
    readsCapacity,
    readWindows,
} from './connection-capacity-readers.ts';

export const capacityReadEveryMs = 15 * 60 * 1000;
const accessFailureGapMs = 60 * 1000;
const refusedPauseMs = 6 * 60 * 60 * 1000;
const rateLimitHoldCapMs = 60 * 60 * 1000;

type Trigger = 'access-failure' | 'sweep';
type ReadOutcome = 'failed' | 'read' | 'refused';

const readGapMs: Record<Trigger, Record<ReadOutcome, number>> = {
    'access-failure': {
        failed: accessFailureGapMs,
        read: accessFailureGapMs,
        refused: refusedPauseMs,
    },
    sweep: { failed: capacityReadEveryMs, read: capacityReadEveryMs, refused: refusedPauseMs },
};

export type CapacityReader = ReturnType<typeof createCapacityReader>;

export function createCapacityReader(input: {
    book: ConnectionBook;
    link: RunnerLink;
    log: (line: string) => void;
    now?: () => Date;
    usageUrls?: CapacityUsageUrls;
}) {
    const now = input.now ?? (() => new Date());
    const lastRead = new Map<
        string,
        { at: number; credentialVersion: number; outcome: ReadOutcome }
    >();
    const reading = new Set<string>();
    const queues = new Map<ModelProvider, Promise<void>>();
    const heldUntil = new Map<ModelProvider, number>();

    const held = (provider: ModelProvider, at: number) => at < (heldUntil.get(provider) ?? 0);

    const send = (
        connection: RunnerModelConnection,
        windows: readonly ModelConnectionCapacityWindow[],
        readAt: Date
    ) => {
        const frame: RunnerConnectionCapacityFrame = {
            connectionId: connection.id,
            credentialVersion: connection.credentialVersion,
            readAt: readAt.toISOString(),
            type: 'runner-connection-capacity',
            windows: [...windows],
        };
        input.link.send(frame);
    };

    const attempt = async (connection: RunnerModelConnection, readAt: Date) => {
        try {
            send(connection, await readWindows(connection, readAt, input.usageUrls ?? {}), readAt);
            return 'read' as const;
        } catch (error) {
            input.log(
                `Runner could not read capacity for ${connection.id}: ${error instanceof Error ? error.message : String(error)}`
            );
            const failure = readFailure(error);
            if (failure.kind !== 'rate-limited') {
                return failure.kind;
            }
            const holdMs = Math.min(
                failure.retryAfterMs ?? capacityReadEveryMs,
                rateLimitHoldCapMs
            );
            heldUntil.set(connection.provider, readAt.getTime() + holdMs);
            return 'failed' as const;
        }
    };

    const readOne = async (connectionId: string) => {
        const connection = input.book.get(connectionId);
        const readAt = now();
        if (!connection || held(connection.provider, readAt.getTime())) {
            return;
        }
        const outcome = await attempt(connection, readAt);
        lastRead.set(connectionId, {
            at: now().getTime(),
            credentialVersion: connection.credentialVersion,
            outcome,
        });
    };

    const enqueue = (connection: RunnerModelConnection) => {
        reading.add(connection.id);
        const read = (queues.get(connection.provider) ?? Promise.resolve())
            .then(() => readOne(connection.id))
            .then(() => {
                reading.delete(connection.id);
            });
        queues.set(connection.provider, read);
        return read;
    };

    const due = (connection: RunnerModelConnection, trigger: Trigger, at: number) => {
        if (reading.has(connection.id) || held(connection.provider, at)) {
            return false;
        }
        const last = lastRead.get(connection.id);
        return (
            !last ||
            last.credentialVersion !== connection.credentialVersion ||
            at - last.at >= readGapMs[trigger][last.outcome]
        );
    };

    return {
        afterAccessFailure(connectionId: string) {
            const connection = input.book.get(connectionId);
            return connection &&
                readsCapacity(connection) &&
                due(connection, 'access-failure', now().getTime())
                ? enqueue(connection)
                : Promise.resolve();
        },
        observed(
            connection: RunnerModelConnection,
            windows: readonly ModelConnectionCapacityWindow[]
        ) {
            send(connection, windows, now());
        },
        async sweep() {
            const listed = input.book.list().filter(readsCapacity);
            const ids = new Set(listed.map((connection) => connection.id));
            for (const connectionId of lastRead.keys()) {
                if (!ids.has(connectionId)) {
                    lastRead.delete(connectionId);
                }
            }
            const at = now().getTime();
            await Promise.all(
                listed.filter((connection) => due(connection, 'sweep', at)).map(enqueue)
            );
        },
    };
}

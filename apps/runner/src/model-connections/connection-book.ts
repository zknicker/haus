import {
    type ModelOAuthCredential,
    modelProviderFor,
    modelProviderNames,
    type RunnerConnectionCredentialAckFrame,
    type RunnerModelConnection,
} from '@haus/api';
import type { RunnerLink } from '../run-context.ts';
import {
    acknowledge,
    applySnapshot,
    type BookEntry,
    type Rotation,
    rotationFrame,
    startRotation,
    viewOf,
} from './connection-rotation.ts';

const firstResendMs = 1000;
const lastResendMs = 60_000;

export type ConnectionBook = ReturnType<typeof createConnectionBook>;

export function createConnectionBook() {
    const entries = new Map<string, BookEntry>();
    const tails = new Map<string, Promise<unknown>>();
    const resends = new Map<string, { attempt: number; timer: ReturnType<typeof setTimeout> }>();

    const serialize = <T>(connectionId: string, operation: () => Promise<T> | T) => {
        const run = (tails.get(connectionId) ?? Promise.resolve()).then(operation);
        const tail = run.then(
            () => undefined,
            () => undefined
        );
        tails.set(connectionId, tail);
        tail.then(() => {
            if (tails.get(connectionId) === tail) {
                tails.delete(connectionId);
            }
        });
        return run;
    };

    const send = (link: RunnerLink, connectionId: string, rotation: Rotation | null) => {
        if (rotation) {
            link.send(rotationFrame(connectionId, rotation));
        }
    };

    const stopResending = (connectionId: string) => {
        const resend = resends.get(connectionId);
        if (resend) {
            clearTimeout(resend.timer);
            resends.delete(connectionId);
        }
    };

    const resendLater = (link: RunnerLink, connectionId: string) => {
        const attempt = (resends.get(connectionId)?.attempt ?? 0) + 1;
        stopResending(connectionId);
        const timer = setTimeout(
            () =>
                void serialize(connectionId, () => {
                    const entry = entries.get(connectionId);
                    send(link, connectionId, rotatingOf(entry));
                }),
            Math.min(firstResendMs * 2 ** (attempt - 1), lastResendMs)
        );
        timer.unref();
        resends.set(connectionId, { attempt, timer });
    };

    const store = (connectionId: string, entry: BookEntry) => {
        if (entry.listed || entry.local.kind === 'rotating') {
            entries.set(connectionId, entry);
        } else {
            entries.delete(connectionId);
        }
    };

    return {
        get(connectionId: string) {
            const entry = entries.get(connectionId);
            return entry?.listed ? viewOf(entry) : undefined;
        },
        list() {
            return [...entries.values()].filter((entry) => entry.listed).map(viewOf);
        },
        replace(snapshot: readonly RunnerModelConnection[]) {
            const incoming = new Map(snapshot.map((connection) => [connection.id, connection]));
            const ids = new Set([...entries.keys(), ...incoming.keys()]);
            return Promise.all(
                [...ids].map((connectionId) =>
                    serialize(connectionId, () => {
                        const next = incoming.get(connectionId);
                        const entry = entries.get(connectionId);
                        if (next) {
                            store(connectionId, applySnapshot(entry, next));
                        } else if (entry) {
                            store(connectionId, { ...entry, listed: false });
                        }
                    })
                )
            );
        },
        rotated(
            connectionId: string,
            change: { credential: ModelOAuthCredential; from: ModelOAuthCredential },
            link: RunnerLink
        ) {
            const entry = entries.get(connectionId);
            if (!entry) {
                return;
            }
            const started = startRotation(entry, change.from, change.credential);
            store(connectionId, started.entry);
            send(link, connectionId, started.send);
        },
        acknowledge(ack: RunnerConnectionCredentialAckFrame, link: RunnerLink) {
            return serialize(ack.connectionId, () => {
                const entry = entries.get(ack.connectionId);
                const settled = entry ? acknowledge(entry, ack) : null;
                if (!settled) {
                    return;
                }
                store(ack.connectionId, settled.entry);
                if (ack.result === 'failed') {
                    resendLater(link, ack.connectionId);
                    return;
                }
                stopResending(ack.connectionId);
                send(link, ack.connectionId, settled.send);
            });
        },
        resend(link: RunnerLink) {
            return Promise.all(
                [...entries.keys()].map((connectionId) =>
                    serialize(connectionId, () => {
                        stopResending(connectionId);
                        send(link, connectionId, rotatingOf(entries.get(connectionId)));
                    })
                )
            );
        },
        serialize,
    };
}

export function connectionForRun(
    book: ConnectionBook,
    connectionId: string | null,
    modelId: string
) {
    const connection = connectionId === null ? undefined : book.get(connectionId);
    return connection?.provider === modelProviderFor(modelId) ? connection : null;
}

export function missingConnectionMessage(modelId: string) {
    return `No ${modelProviderNames[modelProviderFor(modelId)]} connection. Connect one in Settings → Models.`;
}

function rotatingOf(entry: BookEntry | undefined) {
    return entry?.local.kind === 'rotating' ? entry.local.rotation : null;
}


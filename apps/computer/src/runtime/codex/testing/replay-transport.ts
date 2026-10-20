import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodexExit, CodexTransport } from '../codex-transport.ts';

/** One recorded line: what the driver wrote (`in`) or the app-server printed (`out`). */
export interface FixtureRecord {
    readonly dir: 'in' | 'out';
    readonly line: string;
    readonly proc: number;
    readonly t: number;
}

export function readFixture(name: string): FixtureRecord[] {
    const text = readFileSync(join(import.meta.dir, '..', 'fixtures', `${name}.jsonl`), 'utf8');
    return text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as FixtureRecord);
}

/**
 * Replays one recorded app-server process. Output lines play in order; at each recorded
 * driver write the replay waits until the driver writes a message with the same method (or
 * answers the same server request), then maps the recorded request id onto the driver's own.
 * A write the recording does not expect rejects, so a protocol change fails the test.
 */
export function replayTransport(records: readonly FixtureRecord[], proc = 1): ReplayTransport {
    const script = records.filter((record) => record.proc === proc);
    const listeners: Array<(line: string) => void> = [];
    const exit = Promise.withResolvers<CodexExit>();
    const ids = new Map<number | string, number | string>();
    const written: Record<string, unknown>[] = [];
    const queued: PendingWrite[] = [];
    let arrived: (() => void) | null = null;
    let exhausted = false;
    const finished = Promise.withResolvers<void>();

    const nextWrite = async (): Promise<PendingWrite> => {
        while (queued.length === 0) {
            await new Promise<void>((resolve) => {
                arrived = resolve;
            });
        }
        return queued.shift() as PendingWrite;
    };
    /** Takes the driver's next write for a recorded one; false when it wrote something else. */
    const expectWrite = async (record: FixtureRecord): Promise<boolean> => {
        const expected = JSON.parse(record.line) as Record<string, unknown>;
        const write = await nextWrite();
        if (!sameMessage(expected, write.message)) {
            write.reject(
                new Error(
                    `Replay expected ${describe(expected)} but the driver wrote ${describe(write.message)}.`
                )
            );
            return false;
        }
        if (expected.id !== undefined && write.message.id !== undefined) {
            ids.set(expected.id as number, write.message.id as number);
        }
        write.resolve();
        return true;
    };
    /** Plays one recorded output line, answering under the driver's own request id. */
    const playOutput = (record: FixtureRecord) => {
        const message = JSON.parse(record.line) as Record<string, unknown>;
        const recordedId = message.id as number | undefined;
        if (message.method === undefined && recordedId !== undefined && ids.has(recordedId)) {
            message.id = ids.get(recordedId);
        }
        for (const listener of listeners) {
            listener(JSON.stringify(message));
        }
    };
    const play = async () => {
        for (const record of script) {
            if (record.dir === 'in') {
                if (!(await expectWrite(record))) {
                    return;
                }
                continue;
            }
            await Promise.resolve();
            playOutput(record);
        }
        exhausted = true;
        for (const write of queued.splice(0)) {
            write.reject(
                new Error(`The recording ended before the driver wrote ${describe(write.message)}.`)
            );
        }
        finished.resolve();
    };
    void play();
    return {
        done: () => finished.promise,
        exited: exit.promise,
        exit(code = 1, signal: string | null = null) {
            exit.resolve({ code, signal });
        },
        kill: async () => {
            exit.resolve({ code: null, signal: 'SIGTERM' });
            await exit.promise;
        },
        onLine(listener) {
            listeners.push(listener);
        },
        stderrTail: () => '',
        write(line) {
            const message = JSON.parse(line) as Record<string, unknown>;
            written.push(message);
            if (exhausted) {
                return Promise.reject(
                    new Error(`The recording ended before the driver wrote ${describe(message)}.`)
                );
            }
            const { promise, reject, resolve } = Promise.withResolvers<void>();
            queued.push({ message, reject, resolve });
            const wake = arrived;
            arrived = null;
            wake?.();
            return promise;
        },
        written,
    };
}

interface PendingWrite {
    readonly message: Record<string, unknown>;
    readonly reject: (error: Error) => void;
    readonly resolve: () => void;
}

export interface ReplayTransport extends CodexTransport {
    /** Resolves once every recorded line has played. */
    done(): Promise<void>;
    /** Ends the replayed process as a crash would. */
    exit(code?: number, signal?: string | null): void;
    readonly written: readonly Record<string, unknown>[];
}

function sameMessage(expected: Record<string, unknown>, actual: Record<string, unknown>): boolean {
    if (expected.method !== undefined) {
        return expected.method === actual.method;
    }
    // A reply to a server request keeps the app-server's id.
    return expected.id === actual.id && actual.method === undefined;
}

function describe(message: Record<string, unknown> | undefined): string {
    if (!message) {
        return 'nothing';
    }
    return typeof message.method === 'string' ? message.method : `a reply to ${String(message.id)}`;
}

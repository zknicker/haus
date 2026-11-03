import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostToolSession } from '../../../host-tools/mcp-server.ts';
import type { TurnEvent } from '../../turn-event.ts';
import { type ClaudeBackgroundHooks, ClaudeConnection } from '../claude-connection.ts';
import { ClaudeEventNormalizer } from '../claude-event-normalizer.ts';
import type { ClaudeExit, ClaudeProcess } from '../claude-process.ts';
import { createWorkspaceStripper } from '../claude-tool-names.ts';

interface FixtureRecord {
    line: string;
    process: number;
    stream: 'exit' | 'stderr' | 'stdin' | 'stdout';
    t: number;
}

/** The workspace every committed fixture was scrubbed to. */
export const fixtureWorkspace = '/haus-agent/workspace';

export function readFixture(name: string): FixtureRecord[] {
    return readFileSync(join(import.meta.dir, `${name}.jsonl`), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as FixtureRecord);
}

/**
 * A `ClaudeProcess` that replays one recorded process: each stdin write releases the stdout the
 * real CLI printed after the matching recorded write. Control request ids are rewritten so the
 * recorded responses answer the live requests.
 */
export function replayProcess(name: string, processIndex = 0) {
    const records = readFixture(name).filter((record) => record.process === processIndex);
    const segments: FixtureRecord[][] = [[]];
    for (const record of records) {
        if (record.stream === 'stdin') {
            segments.push([]);
        } else {
            segments.at(-1)?.push(record);
        }
    }
    const recordedWrites = records.filter((record) => record.stream === 'stdin');
    const listeners = new Set<(line: string) => void>();
    const stderr: string[] = [];
    const writes: string[] = [];
    const exit = Promise.withResolvers<ClaudeExit>();
    let alive = true;
    let next = 1;
    const ids = new Map<string, string>();
    const release = async (segment: FixtureRecord[], idMap: Map<string, string>) => {
        for (const record of segment) {
            await Bun.sleep(0);
            if (record.stream === 'exit') {
                alive = false;
                exit.resolve({ code: Number(record.line), signal: null });
                return;
            }
            if (record.stream === 'stderr') {
                stderr.push(record.line);
                continue;
            }
            let line = record.line;
            for (const [recorded, live] of idMap) {
                line = line.split(recorded).join(live);
            }
            for (const listener of listeners) {
                listener(line);
            }
        }
    };
    const process: ClaudeProcess & { writes: string[] } = {
        get alive() {
            return alive;
        },
        exited: exit.promise,
        onLine(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        pid: undefined,
        stderrTail: () => [...stderr],
        stop() {
            if (alive) {
                alive = false;
                exit.resolve({ code: null, signal: 'SIGTERM' });
            }
            return Promise.resolve();
        },
        write(line) {
            if (!alive) {
                return Promise.reject(new Error('Claude Code stdin is closed.'));
            }
            writes.push(line);
            const recorded = recordedWrites[next - 1];
            const segment = segments[next] ?? [];
            next += 1;
            // A message's id stays mapped for the rest of the replay: its result may come later.
            for (const [recordedId, liveId] of requestIdMap(recorded?.line, line)) {
                ids.set(recordedId, liveId);
            }
            void release(segment, ids);
            return Promise.resolve();
        },
        writes,
    };
    void release(segments[0] ?? [], new Map());
    return process;
}

/** A connection over a replayed process, launched as the driver launches it. */
export function replayConnection(
    name: string,
    processIndex = 0,
    background?: ClaudeBackgroundHooks
) {
    const process = replayProcess(name, processIndex);
    const hostTools: HostToolSession = {
        close: () => undefined,
        mcp: {
            headers: { Authorization: 'Bearer test' },
            name: 'haus',
            transport: 'http',
            url: '',
        },
        replaceTools: () => undefined,
    };
    const normalizer = new ClaudeEventNormalizer({
        hostServer: 'haus',
        strip: createWorkspaceStripper([fixtureWorkspace]),
    });
    return {
        connection: new ClaudeConnection(
            process,
            normalizer,
            hostTools,
            'replay',
            'replay-session',
            background
        ),
        process,
    };
}

export async function collect(events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
    const collected: TurnEvent[] = [];
    for await (const event of events) {
        collected.push(event);
    }
    return collected;
}

function requestIdMap(recorded: string | undefined, live: string): Map<string, string> {
    const recordedId = recorded ? requestId(recorded) : undefined;
    const liveId = requestId(live);
    return recordedId && liveId ? new Map([[recordedId, liveId]]) : new Map();
}

function requestId(line: string): string | undefined {
    const parsed = JSON.parse(line) as { request_id?: unknown; uuid?: unknown };
    if (typeof parsed.request_id === 'string') {
        return parsed.request_id;
    }
    return typeof parsed.uuid === 'string' ? parsed.uuid : undefined;
}

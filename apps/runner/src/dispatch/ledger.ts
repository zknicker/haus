import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type DispatchKey, type InvocationOutcome, invocationOutcomeSchema } from '@haus/api';
import * as z from 'zod';

export type DispatchKind = 'agent-api' | 'invocation' | 'mcp-call';

const recordSchema = z.discriminatedUnion('state', [
    z.object({
        acceptedAt: z.iso.datetime(),
        kind: z.enum(['agent-api', 'invocation', 'mcp-call']),
        state: z.literal('accepted'),
    }),
    z.object({
        acceptedAt: z.iso.datetime(),
        finishedAt: z.iso.datetime(),
        kind: z.enum(['agent-api', 'invocation', 'mcp-call']),
        outcome: invocationOutcomeSchema,
        state: z.literal('finished'),
    }),
]);

export type DispatchRecord = z.infer<typeof recordSchema>;

const settledRunSchema = z.object({ settledAt: z.iso.datetime() });

export interface RecoveredDispatch {
    readonly agentId: string;
    readonly key: DispatchKey;
    readonly kind: DispatchKind;
}

export type DispatchLedger = ReturnType<typeof openDispatchLedger>;

const settledRetentionMs = 24 * 60 * 60 * 1000;

export function openDispatchLedger(dataDir: string, now: () => Date = () => new Date()) {
    const agentsDir = join(dataDir, 'agents');
    const dirOf = (agentId: string) =>
        join(agentsDir, encodeSegment(agentId), 'runtime', 'dispatches');
    const pathOf = (agentId: string, key: DispatchKey) => join(dirOf(agentId), fileNameOf(key));
    const runsDirOf = (agentId: string) =>
        join(agentsDir, encodeSegment(agentId), 'runtime', 'settled-runs');
    const runPathOf = (agentId: string, runId: string) =>
        join(runsDirOf(agentId), `${encodeSegment(runId)}.json`);
    return {
        async accept(agentId: string, key: DispatchKey, kind: DispatchKind) {
            await mkdir(dirOf(agentId), { recursive: true });
            const record: DispatchRecord = {
                acceptedAt: now().toISOString(),
                kind,
                state: 'accepted',
            };
            await replaceDurably(pathOf(agentId, key), record);
        },
        async finish(agentId: string, key: DispatchKey, outcome: InvocationOutcome) {
            const path = pathOf(agentId, key);
            const current = recordSchema.parse(JSON.parse(await readFile(path, 'utf8')));
            if (current.state === 'finished') {
                return;
            }
            await replaceDurably(path, {
                ...current,
                finishedAt: now().toISOString(),
                outcome,
                state: 'finished',
            });
        },
        async dispatchedIn(agentId: string, runId: string) {
            const prefix = `${encodeSegment(runId)}.`;
            const entries = await readdir(dirOf(agentId)).catch(missingAsEmpty);
            return entries.some((entry) => entry.startsWith(prefix) && entry.endsWith('.json'));
        },
        async read(agentId: string, key: DispatchKey) {
            const text = await readFile(pathOf(agentId, key), 'utf8').catch(missingAsNull);
            return text === null ? null : recordSchema.parse(JSON.parse(text));
        },
        async recover() {
            const recovered: RecoveredDispatch[] = [];
            for (const { agentId, entries } of await listLedgers(agentsDir, dirOf)) {
                for (const entry of entries) {
                    const path = join(dirOf(agentId), entry);
                    if (!entry.endsWith('.json')) {
                        await rm(path, { force: true });
                        continue;
                    }
                    const record = recordSchema.parse(JSON.parse(await readFile(path, 'utf8')));
                    if (record.state !== 'accepted') {
                        continue;
                    }
                    await replaceDurably(path, {
                        ...record,
                        finishedAt: now().toISOString(),
                        outcome: 'unknown',
                        state: 'finished',
                    });
                    recovered.push({ agentId, key: keyOf(entry), kind: record.kind });
                }
            }
            return recovered;
        },
        async settled(agentId: string, runId: string) {
            const path = runPathOf(agentId, runId);
            if ((await readFile(path, 'utf8').catch(missingAsNull)) !== null) {
                return;
            }
            await mkdir(runsDirOf(agentId), { recursive: true });
            await replaceDurably(path, { settledAt: now().toISOString() });
        },
        async prune() {
            const cutoff = now().getTime() - settledRetentionMs;
            let pruned = 0;
            for (const { agentId, entries } of await listLedgers(agentsDir, dirOf)) {
                const expired = await expiredRuns(runsDirOf(agentId), cutoff);
                const holding = new Set<string>();
                for (const entry of entries.filter((name) => name.endsWith('.json'))) {
                    const path = join(dirOf(agentId), entry);
                    const record = recordSchema.parse(JSON.parse(await readFile(path, 'utf8')));
                    const { runId } = keyOf(entry);
                    if (record.state === 'finished' && expired.has(runId)) {
                        await rm(path, { force: true });
                        pruned += 1;
                    } else {
                        holding.add(runId);
                    }
                }
                for (const runId of expired) {
                    if (!holding.has(runId)) {
                        await rm(runPathOf(agentId, runId), { force: true });
                    }
                }
            }
            return pruned;
        },
    };
}

async function listLedgers(agentsDir: string, dirOf: (agentId: string) => string) {
    const agents = await readdir(agentsDir).catch(missingAsEmpty);
    const ledgers: { agentId: string; entries: string[] }[] = [];
    for (const segment of agents) {
        const agentId = decodeURIComponent(segment);
        const entries = await readdir(dirOf(agentId)).catch(missingAsEmpty);
        ledgers.push({ agentId, entries: entries.toSorted() });
    }
    return ledgers;
}

async function expiredRuns(runsDir: string, cutoff: number) {
    const expired = new Set<string>();
    const entries = await readdir(runsDir).catch(missingAsEmpty);
    for (const entry of entries.filter((name) => name.endsWith('.json'))) {
        const run = settledRunSchema.parse(
            JSON.parse(await readFile(join(runsDir, entry), 'utf8'))
        );
        if (Date.parse(run.settledAt) <= cutoff) {
            expired.add(decodeURIComponent(entry.slice(0, -'.json'.length)));
        }
    }
    return expired;
}

async function replaceDurably(path: string, record: object) {
    const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    const file = await open(temp, 'w', 0o600);
    try {
        await file.writeFile(`${JSON.stringify(record)}\n`);
        await file.sync();
    } finally {
        await file.close();
    }
    await rename(temp, path);
    const dir = await open(dirname(path), 'r');
    try {
        await dir.sync();
    } finally {
        await dir.close();
    }
}

function fileNameOf(key: DispatchKey) {
    return `${encodeSegment(key.runId)}.${encodeSegment(key.toolCallId)}.${key.seq}.json`;
}

function keyOf(fileName: string) {
    const [runId = '', toolCallId = '', seq = ''] = fileName.slice(0, -'.json'.length).split('.');
    return {
        runId: decodeURIComponent(runId),
        seq: Number(seq),
        toolCallId: decodeURIComponent(toolCallId),
    };
}

function encodeSegment(value: string) {
    return encodeURIComponent(value).replaceAll('.', '%2E');
}

function missingAsNull(error: unknown) {
    if (isMissing(error)) {
        return null;
    }
    throw error;
}

function missingAsEmpty(error: unknown) {
    if (isMissing(error)) {
        return [] as string[];
    }
    throw error;
}

function isMissing(error: unknown) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

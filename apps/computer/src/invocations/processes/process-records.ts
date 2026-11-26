import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { agentPathSegment, agentProcessIdSchema } from '@haus/api';
import * as z from 'zod';

const processRecordSchema = z
    .object({
        agentId: z.string().min(1),
        command: z.string().min(1),
        exitCode: z.number().int().nullable(),
        exitedAt: z.iso.datetime().nullable(),
        ending: z.enum(['exited', 'killed', 'archived', 'revoked', 'lost']).nullable(),
        pid: z.number().int().positive().nullable(),
        processId: agentProcessIdSchema,
        reportedAt: z.iso.datetime().nullable(),
        runId: z.string().min(1),
        sessionGeneration: z.number().int().positive(),
        startedAt: z.iso.datetime(),
    })
    .strict();

export type ProcessRecord = z.infer<typeof processRecordSchema>;
export type ProcessEnding = NonNullable<ProcessRecord['ending']>;

export function reportsExit(record: ProcessRecord) {
    return record.ending === 'exited' || record.ending === 'revoked' || record.ending === 'lost';
}

const reportedRetentionMs = 7 * 24 * 60 * 60 * 1000;

export function createProcessRecords(agentsRoot: string) {
    const directory = (agentId: string) =>
        join(agentsRoot, agentPathSegment(agentId), 'runtime', 'processes');
    return {
        directory,
        list: async () => {
            const agentIds = await entries(agentsRoot);
            const lists = await Promise.all(
                agentIds.map(async (agentId) => {
                    const names = await entries(join(agentsRoot, agentId, 'runtime', 'processes'));
                    return await Promise.all(
                        names
                            .filter((name) => name.endsWith('.json'))
                            .map((name) =>
                                readRecord(join(agentsRoot, agentId, 'runtime', 'processes', name))
                            )
                    );
                })
            );
            return lists.flat().filter((record) => record !== null);
        },
        logPath: (agentId: string, processId: string) =>
            join(directory(agentId), `${agentProcessIdSchema.parse(processId)}.log`),
        prune: async (records: readonly ProcessRecord[], now: number) => {
            const expired = records.filter(
                (record) =>
                    record.exitedAt !== null &&
                    (record.reportedAt !== null || !reportsExit(record)) &&
                    now - Date.parse(record.exitedAt) > reportedRetentionMs
            );
            await Promise.all(
                expired.flatMap((record) =>
                    ['json', 'log'].map((extension) =>
                        unlinkIfPresent(
                            join(directory(record.agentId), `${record.processId}.${extension}`)
                        )
                    )
                )
            );
            return expired.map((record) => record.processId);
        },
        read: (agentId: string, processId: string) =>
            readRecord(join(directory(agentId), `${agentProcessIdSchema.parse(processId)}.json`)),
        write: async (record: ProcessRecord) => {
            const path = directory(record.agentId);
            await mkdir(path, { mode: 0o700, recursive: true });
            const temporary = join(path, `${record.processId}.${randomUUID()}.tmp`);
            const handle = await open(temporary, 'wx', 0o600);
            try {
                await handle.writeFile(JSON.stringify(record));
                await handle.sync();
            } finally {
                await handle.close();
            }
            await rename(temporary, join(path, `${record.processId}.json`));
        },
    };
}

export type ProcessRecords = ReturnType<typeof createProcessRecords>;

export async function readLogSlice(path: string, afterSeq: number, maxBytes: number) {
    const size = await logSize(path);
    const start = Math.min(afterSeq, size);
    const length = Math.min(size - start, maxBytes);
    if (length === 0) {
        return { nextSeq: start, size, text: '' };
    }
    const handle = await open(path, 'r');
    try {
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, start);
        return { nextSeq: start + length, size, text: buffer.toString('utf8') };
    } finally {
        await handle.close();
    }
}

export async function readLogTail(path: string, chars: number) {
    const size = await logSize(path);
    const slice = await readLogSlice(path, Math.max(0, size - chars * 4), chars * 4);
    return { size, tail: slice.text.slice(-chars) };
}

async function logSize(path: string) {
    try {
        return (await stat(path)).size;
    } catch (error) {
        if (isMissing(error)) {
            return 0;
        }
        throw error;
    }
}

async function readRecord(path: string) {
    let text: string;
    try {
        text = await readFile(path, 'utf8');
    } catch (error) {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    }
    const parsed = processRecordSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
        throw new Error(`Process record ${path} is invalid: ${parsed.error.message}`);
    }
    return parsed.data;
}

async function entries(path: string) {
    try {
        return await readdir(path);
    } catch (error) {
        if (isMissing(error) || isNotDirectory(error)) {
            return [];
        }
        throw error;
    }
}

async function unlinkIfPresent(path: string) {
    try {
        await unlink(path);
    } catch (error) {
        if (!isMissing(error)) {
            throw error;
        }
    }
}

function isMissing(error: unknown) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isNotDirectory(error: unknown) {
    return error instanceof Error && 'code' in error && error.code === 'ENOTDIR';
}

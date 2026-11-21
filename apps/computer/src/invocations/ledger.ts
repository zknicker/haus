import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type InvokeResult,
    invocationOperationKindSchema,
    invokeResultSchema,
    machineInvocationOutcomeSchema,
} from '@haus/api';
import * as z from 'zod';

const acceptedFields = {
    acceptedAt: z.iso.datetime(),
    agentId: z.string().min(1),
    invocationId: z.string().min(1),
    operationKind: invocationOperationKindSchema,
    runId: z.string().min(1),
};

const acceptedRecordSchema = z.object({ ...acceptedFields, state: z.literal('accepted') }).strict();

const finishedRecordSchema = z
    .object({
        ...acceptedFields,
        confirmedAt: z.iso.datetime().optional(),
        exitCode: z.number().int().optional(),
        finishedAt: z.iso.datetime(),
        outcome: machineInvocationOutcomeSchema,
        outputBytes: z.number().int().nonnegative(),
        result: invokeResultSchema,
        state: z.literal('finished'),
    })
    .strict();

const ledgerRecordSchema = z.discriminatedUnion('state', [
    acceptedRecordSchema,
    finishedRecordSchema,
]);

export type AcceptedRecord = z.infer<typeof acceptedRecordSchema>;
type FinishedRecord = z.infer<typeof finishedRecordSchema>;
type LedgerRecord = z.infer<typeof ledgerRecordSchema>;

const confirmedRecordRetentionMs = 24 * 60 * 60 * 1000;
const logRetentionMs = 7 * 24 * 60 * 60 * 1000;

export function createLedger(agentsRoot: string) {
    const durableDirectories = new Set<string>();
    const directory = (agentId: string) =>
        join(agentsRoot, pathSegment(agentId), 'runtime', 'invocations');

    async function ensureDirectory(agentId: string) {
        const path = directory(agentId);
        if (durableDirectories.has(path)) {
            return path;
        }
        await mkdir(path, { mode: 0o700, recursive: true });
        const agentRoot = join(agentsRoot, agentId);
        await Promise.all(
            [path, join(agentRoot, 'runtime'), agentRoot, agentsRoot].map(syncDirectory)
        );
        durableDirectories.add(path);
        return path;
    }

    return {
        list: async () => {
            const agentIds = await childDirectories(agentsRoot);
            const records = await Promise.all(
                agentIds.map((agentId) => readAgentRecords(directory(agentId)))
            );
            return records.flat();
        },
        logPath: (agentId: string, invocationId: string) =>
            join(directory(agentId), `${pathSegment(invocationId)}.log`),
        prune: async (now: number, records: readonly LedgerRecord[]) => {
            const expired = records.filter(
                (record) =>
                    record.state === 'finished' &&
                    record.confirmedAt !== undefined &&
                    now - Date.parse(record.confirmedAt) > confirmedRecordRetentionMs
            );
            await Promise.all(
                expired.map((record) =>
                    unlinkIfPresent(join(directory(record.agentId), `${record.invocationId}.json`))
                )
            );
            const agentIds = await childDirectories(agentsRoot);
            await Promise.all(agentIds.map((agentId) => pruneOutputFiles(directory(agentId), now)));
            return expired.map((record) => record.invocationId);
        },
        read: async (agentId: string, invocationId: string) =>
            await readRecord(join(directory(agentId), `${pathSegment(invocationId)}.json`)),
        write: async (record: LedgerRecord) => {
            const path = await ensureDirectory(record.agentId);
            const id = pathSegment(record.invocationId);
            const temporary = join(path, `${id}.${randomUUID()}.tmp`);
            const handle = await open(temporary, 'wx', 0o600);
            try {
                await handle.writeFile(JSON.stringify(record));
                await handle.sync();
            } finally {
                await handle.close();
            }
            await rename(temporary, join(path, `${id}.json`));
            await syncDirectory(path);
        },
    };
}

export type Ledger = ReturnType<typeof createLedger>;

export function finishedRecord(accepted: AcceptedRecord, result: InvokeResult, finishedAt: string) {
    return {
        ...accepted,
        ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
        finishedAt,
        outcome: result.outcome,
        outputBytes: outputBytes(result.output),
        result,
        state: 'finished',
    } satisfies FinishedRecord;
}

function outputBytes(output: InvokeResult['output']) {
    switch (output.kind) {
        case 'text':
            return Buffer.byteLength(output.text);
        case 'inline':
            return Buffer.from(output.base64, 'base64').byteLength;
        case 'attachment':
            return output.sizeBytes;
    }
}

async function readAgentRecords(path: string) {
    const names = await entriesIfPresent(path);
    const recordNames = names.filter((name) => name.endsWith('.json'));
    const records = await Promise.all(recordNames.map((name) => readRecord(join(path, name))));
    return records.filter((record) => record !== null);
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
    const parsed = ledgerRecordSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
        throw new Error(`Invocation ledger record ${path} is invalid: ${parsed.error.message}`);
    }
    return parsed.data;
}

async function pruneOutputFiles(path: string, now: number) {
    const names = await entriesIfPresent(path);
    const outputNames = names.filter((name) =>
        ['.log', '.tmp', '.png'].some((end) => name.endsWith(end))
    );
    await Promise.all(
        outputNames.map(async (name) => {
            const file = join(path, name);
            const info = await stat(file);
            if (now - info.mtimeMs > logRetentionMs) {
                await unlinkIfPresent(file);
            }
        })
    );
}

async function syncDirectory(path: string) {
    const handle = await open(path, 'r');
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
}

async function childDirectories(path: string) {
    try {
        const entries = await readdir(path, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
        if (isMissing(error)) {
            return [];
        }
        throw error;
    }
}

async function entriesIfPresent(path: string) {
    try {
        return await readdir(path);
    } catch (error) {
        if (isMissing(error)) {
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

function pathSegment(id: string) {
    if (id === '.' || id === '..' || /[/\\\0]/u.test(id)) {
        throw new Error(`Invocation ledger cannot use ${JSON.stringify(id)} as a file name.`);
    }
    return id;
}

function isMissing(error: unknown) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

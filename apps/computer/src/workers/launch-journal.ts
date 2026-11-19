import { createHash, randomUUID } from 'node:crypto';
import { type FileHandle, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { cloudAgentProviderSchema, workerTurnStatusSchema } from '@haus/api';
import * as z from 'zod';
import { workerLaunchTimeoutMs } from './launch-attempt.ts';
import type { WorkerLaunch, WorkerTurnRef } from './provider.ts';

const launchSchema = z.object({
    /** Absent in records written before the environment pin existed. */
    environmentId: z.string().min(1).nullable().default(null),
    environmentName: z.string().min(1).nullable().default(null),
    providerAgentId: z.string().min(1),
    /** Null for a provider that names the execution only once a reading finds it. */
    providerRunId: z.string().min(1).nullable(),
    providerUrl: z.string().nullable(),
    status: workerTurnStatusSchema,
    startedAt: z.iso.datetime().optional(),
});
/** Retryable send failures so far; absent until the first attempt fails. */
const deliverySchema = z.object({
    attempts: z.number().int().positive(),
    firstAttemptAt: z.string().min(1),
    lastError: z.string(),
    nextAttemptAt: z.string().min(1),
    /** When the auto-interrupt fallback was tried; null until it is. */
    interruptedAt: z.string().min(1).nullable().default(null),
});
const recordSchema = z.discriminatedUnion('phase', [
    z.object({
        phase: z.literal('pending'),
        workerId: z.string(),
        instructions: z.string().min(1),
        /** Absent in records written before Server resolved a model: no model sent. */
        model: z
            .object({
                id: z.string().min(1),
                params: z.array(z.object({ id: z.string().min(1), value: z.string().min(1) })),
            })
            .nullable()
            .default(null),
        providerAgentId: z.string().min(1),
        interrupt: z.boolean(),
        predecessors: z.array(
            z.object({
                /** Absent in records written before Claude: those were Cursor's. */
                provider: cloudAgentProviderSchema.default('cursor'),
                workerId: z.string(),
                turnId: z.string(),
                providerAgentId: z.string().nullable(),
                providerRunId: z.string().nullable(),
            })
        ),
        delivery: deliverySchema.nullable().default(null),
    }),
    z.object({ phase: z.literal('cancelled'), workerId: z.string() }),
    z.object({
        phase: z.literal('launching'),
        workerId: z.string(),
        deadlineAt: z.iso.datetime().optional(),
    }),
    z.object({
        phase: z.literal('launched'),
        workerId: z.string(),
        launch: launchSchema,
        /** This follow-up only delivered after Haus auto-interrupted the session. */
        autoInterrupted: z.boolean().default(false),
    }),
    z.object({
        phase: z.literal('rejected'),
        workerId: z.string(),
        /** Absent in records written before rejections carried a reason. */
        errorCode: z.string().min(1).default('provider-launch-rejected'),
        summary: z.string().min(1).nullable().default(null),
    }),
]);
export type CloudLaunchRecord = z.infer<typeof recordSchema>;
export type CloudPendingSend = Extract<CloudLaunchRecord, { phase: 'pending' }>;
/** Why a Run settled failed without reaching the provider. */
export interface CloudLaunchRejection {
    errorCode: string;
    summary: string;
}

/** Pending prompts stay on Computer in private files, removed when sent or cancelled. */
export class CloudLaunchJournal {
    constructor(private readonly dataRoot: string) {}

    async read(serverId: string, ref: WorkerTurnRef): Promise<CloudLaunchRecord | null> {
        let contents: string;
        try {
            contents = await readFile(this.path(serverId, ref.turnId), 'utf8');
        } catch (cause) {
            if (hasCode(cause, 'ENOENT')) {
                return null;
            }
            throw cause;
        }
        const record = recordSchema.parse(JSON.parse(contents));
        if (record.workerId !== ref.workerId) {
            throw new Error('Cloud launch journal work identity does not match.');
        }
        return record;
    }

    /**
     * Exclusive creation is the admission lock, including across process
     * restarts. A launch claims `launching`, a follow-up its pending prompt, and
     * a Run that never got either claims its settled outcome so a late writer loses.
     */
    async claim(
        serverId: string,
        ref: WorkerTurnRef,
        initial?: z.input<typeof recordSchema>
    ): Promise<boolean> {
        const record = recordSchema.parse(
            initial ?? {
                phase: 'launching',
                workerId: ref.workerId,
                deadlineAt: new Date(Date.now() + workerLaunchTimeoutMs).toISOString(),
            }
        );
        await mkdir(this.directory(serverId), { recursive: true, mode: 0o700 });
        let file: FileHandle;
        try {
            file = await open(this.path(serverId, ref.turnId), 'wx', 0o600);
        } catch (cause) {
            if (hasCode(cause, 'EEXIST')) {
                return false;
            }
            throw cause;
        }
        try {
            await file.writeFile(JSON.stringify(record));
            await file.sync();
        } finally {
            await file.close();
        }
        return true;
    }

    async record(
        serverId: string,
        ref: WorkerTurnRef,
        launch: WorkerLaunch,
        options?: { autoInterrupted?: boolean }
    ): Promise<boolean> {
        const record = recordSchema.parse({
            phase: 'launched',
            workerId: ref.workerId,
            launch,
            autoInterrupted: options?.autoInterrupted ?? false,
        });
        return await this.write(serverId, ref, record);
    }

    async reject(
        serverId: string,
        ref: WorkerTurnRef,
        rejection: CloudLaunchRejection
    ): Promise<void> {
        await this.write(serverId, ref, {
            phase: 'rejected',
            workerId: ref.workerId,
            ...rejection,
        });
    }

    /** Records one retryable send failure; the prompt stays pending. */
    async defer(
        serverId: string,
        ref: WorkerTurnRef,
        pending: CloudPendingSend,
        delivery: NonNullable<CloudPendingSend['delivery']>
    ): Promise<void> {
        await this.write(serverId, ref, { ...pending, delivery });
    }

    async cancel(serverId: string, ref: WorkerTurnRef): Promise<void> {
        await this.write(serverId, ref, { phase: 'cancelled', workerId: ref.workerId });
    }

    private async write(
        serverId: string,
        ref: WorkerTurnRef,
        record: CloudLaunchRecord
    ): Promise<boolean> {
        const destination = this.path(serverId, ref.turnId);
        return await serializeWrite(destination, async () => {
            const existing = await this.read(serverId, ref);
            if (existing?.phase === 'cancelled' || existing?.phase === 'rejected') {
                return false;
            }
            if (existing?.phase === 'launched') {
                return record.phase === 'launched';
            }
            await this.replace(destination, record);
            return true;
        });
    }

    private async replace(destination: string, record: CloudLaunchRecord): Promise<void> {
        const temporary = `${destination}.${randomUUID()}.tmp`;
        const file = await open(temporary, 'wx', 0o600);
        try {
            await file.writeFile(JSON.stringify(record));
            await file.sync();
            await file.close();
            await rename(temporary, destination);
        } finally {
            await file.close();
            await rm(temporary, { force: true });
        }
    }

    private directory(serverId: string): string {
        const partition = createHash('sha256').update(serverId).digest('hex');
        return join(this.dataRoot, 'worker-launches', partition);
    }

    private path(serverId: string, turnId: string): string {
        const key = createHash('sha256').update(turnId).digest('hex');
        return join(this.directory(serverId), `${key}.json`);
    }
}

function hasCode(cause: unknown, code: string): boolean {
    return cause instanceof Error && 'code' in cause && cause.code === code;
}

const writes = new Map<string, Promise<void>>();

/** All journal instances in the attachment share one writer for each Run. */
async function serializeWrite<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const previous = writes.get(path) ?? Promise.resolve();
    const ready = Promise.withResolvers<void>();
    writes.set(path, ready.promise);
    await previous;
    try {
        return await operation();
    } finally {
        ready.resolve();
        if (writes.get(path) === ready.promise) {
            writes.delete(path);
        }
    }
}

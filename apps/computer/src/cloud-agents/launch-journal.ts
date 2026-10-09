import { createHash, randomUUID } from 'node:crypto';
import { type FileHandle, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import type { CloudAgentLaunch, CloudAgentRunRef } from './provider.ts';

const launchSchema = z.object({
    providerAgentId: z.string().min(1),
    providerRunId: z.string().min(1),
    providerUrl: z.string().nullable(),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'expired']),
});
/** Retryable send failures so far; absent until the first attempt fails. */
const deliverySchema = z.object({
    attempts: z.number().int().positive(),
    firstAttemptAt: z.string().min(1),
    lastError: z.string(),
    nextAttemptAt: z.string().min(1),
});
const recordSchema = z.discriminatedUnion('phase', [
    z.object({
        phase: z.literal('pending'),
        workId: z.string(),
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
                workId: z.string(),
                runId: z.string(),
                providerAgentId: z.string().nullable(),
                providerRunId: z.string().nullable(),
            })
        ),
        delivery: deliverySchema.nullable().default(null),
    }),
    z.object({ phase: z.literal('cancelled'), workId: z.string() }),
    z.object({ phase: z.literal('launching'), workId: z.string() }),
    z.object({ phase: z.literal('launched'), workId: z.string(), launch: launchSchema }),
    z.object({
        phase: z.literal('rejected'),
        workId: z.string(),
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

    async read(serverId: string, ref: CloudAgentRunRef): Promise<CloudLaunchRecord | null> {
        let contents: string;
        try {
            contents = await readFile(this.path(serverId, ref.runId), 'utf8');
        } catch (cause) {
            if (hasCode(cause, 'ENOENT')) {
                return null;
            }
            throw cause;
        }
        const record = recordSchema.parse(JSON.parse(contents));
        if (record.workId !== ref.workId) {
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
        ref: CloudAgentRunRef,
        initial?: z.input<typeof recordSchema>
    ): Promise<boolean> {
        const record = recordSchema.parse(initial ?? { phase: 'launching', workId: ref.workId });
        await mkdir(this.directory(serverId), { recursive: true, mode: 0o700 });
        let file: FileHandle;
        try {
            file = await open(this.path(serverId, ref.runId), 'wx', 0o600);
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

    async record(serverId: string, ref: CloudAgentRunRef, launch: CloudAgentLaunch): Promise<void> {
        const record = recordSchema.parse({ phase: 'launched', workId: ref.workId, launch });
        await this.write(serverId, ref, record);
    }

    async reject(
        serverId: string,
        ref: CloudAgentRunRef,
        rejection: CloudLaunchRejection
    ): Promise<void> {
        await this.write(serverId, ref, { phase: 'rejected', workId: ref.workId, ...rejection });
    }

    /** Records one retryable send failure; the prompt stays pending. */
    async defer(
        serverId: string,
        ref: CloudAgentRunRef,
        pending: CloudPendingSend,
        delivery: NonNullable<CloudPendingSend['delivery']>
    ): Promise<void> {
        await this.write(serverId, ref, { ...pending, delivery });
    }

    async cancel(serverId: string, ref: CloudAgentRunRef): Promise<void> {
        await this.write(serverId, ref, { phase: 'cancelled', workId: ref.workId });
    }

    private async write(
        serverId: string,
        ref: CloudAgentRunRef,
        record: CloudLaunchRecord
    ): Promise<void> {
        const destination = this.path(serverId, ref.runId);
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
        return join(this.dataRoot, 'cloud-agent-launches', partition);
    }

    private path(serverId: string, runId: string): string {
        const key = createHash('sha256').update(runId).digest('hex');
        return join(this.directory(serverId), `${key}.json`);
    }
}

function hasCode(cause: unknown, code: string): boolean {
    return cause instanceof Error && 'code' in cause && cause.code === code;
}

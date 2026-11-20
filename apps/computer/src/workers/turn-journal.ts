import { createHash, randomUUID } from 'node:crypto';
import { type FileHandle, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { workerLaunchTimeoutMs } from './launch-attempt.ts';
import { preWorkerTurnRecordSchema } from './pre-worker-turn-record.ts';
import type { WorkerLaunch, WorkerTurnRef } from './provider.ts';
import {
    type WorkerSendingTurn,
    type WorkerTurnRecord,
    type WorkerTurnRecordInput,
    type WorkerTurnRejection,
    workerTurnRecordSchema,
} from './turn-record.ts';

export class WorkerTurnJournal {
    constructor(private readonly dataRoot: string) {}

    async read(serverId: string, ref: WorkerTurnRef) {
        const record = await this.readRecord(serverId, ref.turnId);
        if (record && record.workerId !== ref.workerId) {
            throw new Error('Worker turn journal identity does not match.');
        }
        return record;
    }

    async accept(serverId: string, ref: WorkerTurnRef, record: WorkerTurnRecordInput) {
        if (await this.claim(serverId, ref, record)) {
            return true;
        }
        const destination = this.path(serverId, ref.turnId);
        return await serializeWrite(destination, async () => {
            const existing = await this.read(serverId, ref);
            if (existing && existing.phase !== 'pending') {
                return false;
            }
            await this.replace(destination, workerTurnRecordSchema.parse(record));
            return true;
        });
    }

    async claim(serverId: string, ref: WorkerTurnRef, initial?: WorkerTurnRecordInput) {
        const record = workerTurnRecordSchema.parse(
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
    ) {
        const record = workerTurnRecordSchema.parse({
            phase: 'launched',
            workerId: ref.workerId,
            launch,
            autoInterrupted: options?.autoInterrupted ?? false,
        });
        return await this.write(serverId, ref, record);
    }

    async reject(serverId: string, ref: WorkerTurnRef, rejection: WorkerTurnRejection) {
        await this.write(serverId, ref, {
            phase: 'rejected',
            workerId: ref.workerId,
            ...rejection,
        });
    }

    async defer(
        serverId: string,
        ref: WorkerTurnRef,
        sending: WorkerSendingTurn,
        delivery: NonNullable<WorkerSendingTurn['delivery']>
    ) {
        await this.write(serverId, ref, { ...sending, delivery });
    }

    async cancel(serverId: string, ref: WorkerTurnRef) {
        await this.write(serverId, ref, { phase: 'cancelled', workerId: ref.workerId });
    }

    async forgetHeldFollowUp(serverId: string, turnId: string) {
        const destination = this.path(serverId, turnId);
        await serializeWrite(destination, async () => {
            if ((await this.readRecord(serverId, turnId))?.phase === 'pending') {
                await rm(destination);
            }
        });
    }

    private async readRecord(serverId: string, turnId: string) {
        let contents: string;
        try {
            contents = await readFile(this.path(serverId, turnId), 'utf8');
        } catch (cause) {
            if (hasCode(cause, 'ENOENT')) {
                return null;
            }
            throw cause;
        }
        const value = JSON.parse(contents);
        return 'workId' in value
            ? preWorkerTurnRecordSchema.parse(value)
            : workerTurnRecordSchema.parse(value);
    }

    private async write(serverId: string, ref: WorkerTurnRef, record: WorkerTurnRecord) {
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

    private async replace(destination: string, record: WorkerTurnRecord) {
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

    private directory(serverId: string) {
        const partition = createHash('sha256').update(serverId).digest('hex');
        // WARNING: the pre-Workers directory name stays, so an upgrade still finds follow-ups to drain.
        return join(this.dataRoot, 'cloud-agent-launches', partition);
    }

    private path(serverId: string, turnId: string) {
        const key = createHash('sha256').update(turnId).digest('hex');
        return join(this.directory(serverId), `${key}.json`);
    }
}

function hasCode(cause: unknown, code: string) {
    return cause instanceof Error && 'code' in cause && cause.code === code;
}

const writes = new Map<string, Promise<void>>();

async function serializeWrite<T>(path: string, operation: () => Promise<T>) {
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

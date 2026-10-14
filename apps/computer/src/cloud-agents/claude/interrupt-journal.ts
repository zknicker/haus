import { createHash, randomUUID } from 'node:crypto';
import { type FileHandle, mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';

export const interruptIntentSchema = z.object({
    workId: z.string(),
    cancelRequestedAt: z.string(),
    sessionId: z.string(),
    runIds: z.array(z.string()).min(1),
    promptId: z.string().nullable(),
    requestId: z.uuid(),
    eventUuid: z.uuid(),
    boundary: z.string().regex(/^\d+$/u),
    activeTasks: z.array(z.string()),
});
const taskIntentSchema = z.object({ taskId: z.string(), requestId: z.uuid(), eventUuid: z.uuid() });
const receiptSchema = z.object({
    requestId: z.uuid(),
    eventUuid: z.uuid(),
    responseUuid: z.string(),
    responseSequence: z.string(),
    confirmedAt: z.iso.datetime(),
});
export type ClaudeInterruptIntent = z.infer<typeof interruptIntentSchema>;
export type ClaudeInterruptReceipt = z.infer<typeof receiptSchema>;

/** One immutable work-scoped intent and one immutable receipt, never native credentials. */
export class ClaudeInterruptJournal {
    private readonly directory: string;
    constructor(dataRoot: string, serverId: string, workId: string, stamp: string) {
        this.directory = join(
            dataRoot,
            'claude-cloud-interrupts',
            createHash('sha256')
                .update(JSON.stringify([serverId, workId, stamp]))
                .digest('hex')
        );
    }
    async intent(): Promise<ClaudeInterruptIntent | null> {
        return read(this.path('intent'), interruptIntentSchema);
    }
    async admit(intent: ClaudeInterruptIntent): Promise<ClaudeInterruptIntent> {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        await exclusive(this.path('intent'), JSON.stringify(interruptIntentSchema.parse(intent)));
        const recorded = await this.intent();
        if (!recorded) {
            throw new Error('Native interrupt intent could not be recovered.');
        }
        return recorded;
    }
    async task(taskId: string) {
        return read(this.path(taskKey(taskId)), taskIntentSchema);
    }
    async admitTask(taskId: string) {
        const value = { taskId, requestId: randomUUID(), eventUuid: randomUUID() };
        await exclusive(this.path(taskKey(taskId)), JSON.stringify(value));
        const recorded = await this.task(taskId);
        if (!recorded) {
            throw new Error('Native task-stop intent could not be recovered.');
        }
        return recorded;
    }
    async dispatchTask(taskId: string) {
        return exclusive(this.path(`${taskKey(taskId)}-dispatch`), 'dispatching');
    }
    async dispatch(): Promise<boolean> {
        return exclusive(this.path('dispatch'), 'dispatching');
    }
    async receipt(): Promise<ClaudeInterruptReceipt | null> {
        return read(this.path('receipt'), receiptSchema);
    }
    async confirm(receipt: ClaudeInterruptReceipt): Promise<void> {
        await exclusive(this.path('receipt'), JSON.stringify(receiptSchema.parse(receipt)));
    }
    private path(name: string) {
        return join(this.directory, `${name}.json`);
    }
}

async function exclusive(path: string, value: string): Promise<boolean> {
    let handle: FileHandle;
    try {
        handle = await open(path, 'wx', 0o600);
    } catch (error) {
        if (hasCode(error, 'EEXIST')) {
            return false;
        }
        throw error;
    }
    try {
        await handle.writeFile(value);
        await handle.sync();
    } finally {
        await handle.close();
    }
    return true;
}
async function read<Schema extends z.ZodType>(
    path: string,
    schema: Schema
): Promise<z.infer<Schema> | null> {
    try {
        return schema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
        if (hasCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
}
function hasCode(error: unknown, code: string): boolean {
    return error instanceof Error && 'code' in error && error.code === code;
}

function taskKey(taskId: string) {
    return `task-${createHash('sha256').update(taskId).digest('hex')}`;
}

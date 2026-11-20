import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Subprocess } from 'bun';

export const spawned = new Set<Subprocess>();
export const dataRoots = new Set<string>();

export async function releaseSpawned() {
    for (const child of spawned) {
        child.kill('SIGKILL');
    }
    await Promise.all([...spawned].map((child) => child.exited));
    spawned.clear();
    for (const dataRoot of dataRoots) {
        const servers = await readdir(join(dataRoot, 'servers')).catch(() => []);
        for (const serverId of servers) {
            await killAttachmentDaemon(join(dataRoot, 'servers', serverId));
        }
        await rm(dataRoot, { force: true, recursive: true });
    }
    dataRoots.clear();
}

export function firstOf(
    reconnected: Promise<void>,
    resident: { exited: Promise<number> },
    deadlineMs: number
) {
    return Promise.race([
        reconnected.then(() => 'reconnected'),
        resident.exited.then((code) => `the resident exited ${code} before reconnecting`),
        Bun.sleep(deadlineMs).then(() => `no reconnect within ${deadlineMs}ms`),
    ]);
}

async function killAttachmentDaemon(attachmentRoot: string) {
    const marker = await readFile(join(attachmentRoot, 'attachment-daemon.pid'), 'utf8').catch(
        () => null
    );
    const pid = marker ? (JSON.parse(marker) as { pid?: number }).pid : undefined;
    if (typeof pid === 'number') {
        try {
            process.kill(pid, 'SIGKILL');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
                throw error;
            }
        }
    }
}

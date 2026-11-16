import { randomBytes } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AgentInboxLocation {
    agentId: string;
    dataRoot: string;
    serverId: string;
}

const inboxWrites = new Map<string, Promise<void>>();

export function inboxRoot(location: AgentInboxLocation) {
    return join(
        location.dataRoot,
        'servers',
        location.serverId,
        'agents',
        location.agentId,
        'runtime',
        'inbox'
    );
}

export async function writeJsonAtomic(path: string, value: unknown) {
    await mkdir(join(path, '..'), { mode: 0o700, recursive: true });
    const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    await rename(temporary, path);
}

export function isMissingFile(error: unknown): boolean {
    return (
        error instanceof Error &&
        'code' in error &&
        (error as Error & { code?: string }).code === 'ENOENT'
    );
}

/** Serializes one Agent's inbox writes: every mirror change reads then rewrites its files. */
export async function withInboxWrite<T>(
    location: AgentInboxLocation,
    write: () => Promise<T>
): Promise<T> {
    const key = inboxRoot(location);
    const previous = inboxWrites.get(key) ?? Promise.resolve();
    const result = previous.then(write, write);
    const settled = result.then(
        () => undefined,
        () => undefined
    );
    inboxWrites.set(key, settled);
    try {
        return await result;
    } finally {
        if (inboxWrites.get(key) === settled) {
            inboxWrites.delete(key);
        }
    }
}

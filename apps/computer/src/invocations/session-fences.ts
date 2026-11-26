import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { agentPathSegment } from '@haus/api';
import * as z from 'zod';

const archiveSchema = z.object({ generation: z.number().int().positive() }).strict();

export function createSessionFences(agentsRoot: string) {
    const archived = new Map<string, number>();
    const path = (agentId: string) =>
        join(agentsRoot, agentPathSegment(agentId), 'runtime', 'session-archive.json');

    async function archivedGeneration(agentId: string) {
        const cached = archived.get(agentId);
        if (cached !== undefined) {
            return cached;
        }
        const generation = await readGeneration(path(agentId));
        archived.set(agentId, generation);
        return generation;
    }

    return {
        allows: async (agentId: string, generation: number) =>
            generation >= (await archivedGeneration(agentId)),
        archive: async (agentId: string, generation: number) => {
            if (generation <= (await archivedGeneration(agentId))) {
                return false;
            }
            await writeGeneration(path(agentId), generation);
            archived.set(agentId, generation);
            return true;
        },
    };
}

async function readGeneration(path: string) {
    try {
        return archiveSchema.parse(JSON.parse(await readFile(path, 'utf8'))).generation;
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return 0;
        }
        throw error;
    }
}

async function writeGeneration(path: string, generation: number) {
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
        await handle.writeFile(JSON.stringify({ generation }));
        await handle.sync();
    } finally {
        await handle.close();
    }
    await rename(temporary, path);
}

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { agentPathSegment } from '@haus/api';
import * as z from 'zod';

const markerSchema = z.object({ generation: z.number().int().positive() });

export function sessionAuthority(dataDir: string) {
    const directory = join(dataDir, 'agent-sessions');
    const markerOf = (agentId: string) => join(directory, `${agentPathSegment(agentId)}.json`);
    return {
        async applied(agentId: string) {
            const text = await readFile(markerOf(agentId), 'utf8').catch((error: unknown) => {
                if (isMissing(error)) {
                    return null;
                }
                throw error;
            });
            return text === null ? null : markerSchema.parse(JSON.parse(text)).generation;
        },
        async advance(agentId: string, generation: number) {
            await mkdir(directory, { mode: 0o700, recursive: true });
            const destination = markerOf(agentId);
            const temporary = `${destination}.${process.pid}.tmp`;
            await writeFile(temporary, `${JSON.stringify({ generation })}\n`, { mode: 0o600 });
            await rename(temporary, destination);
        },
        async forget(agentId: string) {
            await rm(markerOf(agentId), { force: true });
        },
    };
}

function isMissing(error: unknown) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

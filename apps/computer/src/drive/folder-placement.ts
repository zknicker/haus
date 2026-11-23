import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import type { DriveFolderLayout } from './folder-state.ts';

const placementSchema = z.object({ generation: z.number().int().nonnegative() });

export async function claimFolderPlacement(
    agentRoot: string,
    layout: DriveFolderLayout,
    generation: number
) {
    const file = placementFile(agentRoot);
    const recorded = await readPlacement(file);
    if (generation < recorded) {
        return 'stale' as const;
    }
    if (generation === recorded) {
        return 'current' as const;
    }
    if (await exists(layout.folder)) {
        const kept = join(
            agentRoot,
            'workspace',
            'drive-before-move',
            `placement-${recorded}-${Date.now()}`
        );
        await mkdir(join(kept, '..'), { recursive: true });
        await rename(layout.folder, kept);
    }
    await rm(layout.stateFile, { force: true });
    await mkdir(join(file, '..'), { mode: 0o700, recursive: true });
    await writeFile(file, JSON.stringify({ generation }), { mode: 0o600 });
    return 'reset' as const;
}

function placementFile(agentRoot: string) {
    return join(agentRoot, 'runtime', 'drive-placement.json');
}

async function readPlacement(file: string) {
    const raw = await readFile(file, 'utf8').catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    });
    return raw === null ? 0 : placementSchema.parse(JSON.parse(raw)).generation;
}

async function exists(path: string) {
    return (await lstat(path).catch(() => null)) !== null;
}

import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AgentDrive } from '../drive/agent-drive.ts';
import { type DriveSeedEntry, legacyRoots } from './drive-sources.ts';

export function folderPath(drive: AgentDrive, entry: DriveSeedEntry) {
    return join(drive.folder, ...entry.drivePath.split('/'));
}

export async function placeEntry(drive: AgentDrive, entry: DriveSeedEntry) {
    const target = folderPath(drive, entry);
    const current = await readFile(target).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    });
    if (current === null) {
        await mkdir(dirname(target), { mode: 0o755, recursive: true });
        const temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`;
        await writeFile(temporary, entry.bytes, { mode: 0o644 });
        await rename(temporary, target);
    }
    if (entry.legacyPath) {
        await rm(entry.legacyPath, { force: true });
    }
}

export async function removeLegacyDirectories(agentRoot: string) {
    const roots = legacyRoots(agentRoot);
    await Promise.all([removeEmptyTree(roots.notes), removeEmptyTree(roots.pages)]);
    await rm(roots.skills, { force: true, recursive: true });
}

async function removeEmptyTree(root: string) {
    const directories = [root];
    for (const directory of directories) {
        const entries = await readdir(directory, { withFileTypes: true }).catch(
            tolerate(['ENOENT', 'ENOTDIR'], [])
        );
        for (const entry of entries) {
            if (entry.isDirectory()) {
                directories.push(join(directory, entry.name));
            }
        }
    }
    for (const directory of directories.reverse()) {
        await rmdir(directory).catch(tolerate(['ENOENT', 'ENOTDIR', 'ENOTEMPTY', 'EEXIST'], null));
    }
}

function tolerate<T>(codes: readonly string[], value: T) {
    return (error: unknown) => {
        if (codes.includes((error as NodeJS.ErrnoException).code ?? '')) {
            return value;
        }
        throw error;
    };
}

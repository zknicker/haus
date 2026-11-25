import type { Stats } from 'node:fs';
import { lstat, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

export interface FileStamp {
    ino: number;
    mtimeMs: number;
    size: number;
}

export function stampOf(stat: Stats) {
    return { ino: stat.ino, mtimeMs: stat.mtimeMs, size: stat.size } satisfies FileStamp;
}

export function sameStamp(stat: FileStamp | null, expected: FileStamp | null) {
    if (stat === null || expected === null) {
        return stat === expected;
    }
    return (
        stat.ino === expected.ino &&
        stat.mtimeMs === expected.mtimeMs &&
        stat.size === expected.size
    );
}

const skippedNames = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store']);

export function isSkippedPath(path: string) {
    return path.split('/').some((segment) => skippedNames.has(segment));
}

export async function walkFolder(folder: string) {
    const files = new Map<string, { mtimeMs: number; size: number }>();
    const visit = async (dir: string, prefix: string) => {
        const entries = await readdir(dir, { withFileTypes: true }).catch(
            (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') {
                    return [];
                }
                throw error;
            }
        );
        for (const entry of entries) {
            if (skippedNames.has(entry.name)) {
                continue;
            }
            const onDisk = await composeName(dir, entry.name);
            const name = `${prefix}${onDisk}`;
            if (entry.isDirectory()) {
                await visit(join(dir, onDisk), `${name}/`);
            } else if (entry.isFile()) {
                const stat = await lstat(join(dir, onDisk));
                files.set(name, { mtimeMs: stat.mtimeMs, size: stat.size });
            }
        }
    };
    await visit(folder, '');
    return files;
}

async function composeName(dir: string, name: string) {
    const composed = name.normalize('NFC');
    if (composed === name) {
        return name;
    }
    const [raw, existing] = await Promise.all([
        lstat(join(dir, name)),
        lstat(join(dir, composed)).catch(() => null),
    ]);
    if (existing && existing.ino !== raw.ino) {
        return name;
    }
    if (!existing) {
        await rename(join(dir, name), join(dir, composed));
    }
    return composed;
}

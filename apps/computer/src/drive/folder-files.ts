import { randomUUID } from 'node:crypto';
import { chmod, link, lstat, mkdir, readdir, rename, rm, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import type { DriveFileRecord, DriveFolderLayout } from './folder-state.ts';

export interface LocalFile {
    mtimeMs: number;
    sha256: string;
    size: number;
}

const skippedNames = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store']);

export function isSkippedPath(path: string) {
    return path.split('/').some((segment) => skippedNames.has(segment));
}

export function folderFiles(layout: DriveFolderLayout) {
    const lockable = new Set<string>();
    const absolute = (path: string) => join(layout.folder, ...path.split('/'));

    async function openParents(target: string, readOnlyRoot: string | null) {
        await mkdir(layout.folder, { recursive: true });
        const root = readOnlyRoot === null ? null : absolute(readOnlyRoot);
        let dir = layout.folder;
        for (const segment of relative(layout.folder, dirname(target)).split(sep)) {
            if (segment === '') {
                continue;
            }
            dir = join(dir, segment);
            const stat = await lstat(dir).catch(() => null);
            if (!stat) {
                await mkdir(dir, { mode: 0o755 });
            } else if ((stat.mode & 0o200) === 0) {
                await chmod(dir, 0o755);
            }
            if (root !== null && (dir === root || dir.startsWith(`${root}${sep}`))) {
                lockable.add(dir);
            }
        }
    }

    return {
        absolute,
        async inspect(path: string, record?: DriveFileRecord) {
            const stat = await lstat(absolute(path)).catch(() => null);
            if (!stat) {
                return null;
            }
            if (!stat.isFile()) {
                return 'blocked' as const;
            }
            if (record && stat.size === record.size_bytes && stat.mtimeMs === record.mtime_ms) {
                return { mtimeMs: stat.mtimeMs, sha256: record.sha256, size: stat.size };
            }
            return {
                mtimeMs: stat.mtimeMs,
                sha256: await sha256File(absolute(path)),
                size: stat.size,
            } satisfies LocalFile;
        },
        clearScratch: () => rm(layout.scratch, { force: true, recursive: true }),
        scratchFile: async () => {
            await mkdir(layout.scratch, { mode: 0o700, recursive: true });
            return join(layout.scratch, randomUUID());
        },
        async place(path: string, source: string, readOnlyRoot: string | null) {
            const target = absolute(path);
            await openParents(target, readOnlyRoot);
            await chmod(source, readOnlyRoot === null ? 0o644 : 0o444);
            await rename(source, target);
            return (await lstat(target)).mtimeMs;
        },
        async remove(path: string, readOnlyRoot: string | null) {
            const target = absolute(path);
            if (!(await holdsExactFile(target))) {
                return;
            }
            await openParents(target, readOnlyRoot);
            await unlink(target);
            await pruneEmptyParents(layout.folder, target);
        },
        async setAside(path: string, target: string, sha256: string, readOnlyRoot: string | null) {
            const source = absolute(path);
            await openParents(source, readOnlyRoot);
            await mkdir(dirname(target), { recursive: true });
            for (let attempt = 1; ; attempt += 1) {
                const candidate = attempt === 1 ? target : `${target}.${attempt}`;
                const existing = await lstat(candidate).catch(() => null);
                if (existing?.isFile() && (await sha256File(candidate)) === sha256) {
                    return candidate;
                }
                if (!existing) {
                    await link(source, candidate);
                    return candidate;
                }
            }
        },
        async occupant(path: string) {
            const stat = await lstat(absolute(path)).catch(() => null);
            if (!stat) {
                return 'none' as const;
            }
            if (!stat.isFile()) {
                return 'other' as const;
            }
            return (await holdsExactFile(absolute(path)))
                ? ('exact' as const)
                : ('variant' as const);
        },
        async respell(from: string, to: string, readOnlyRoot: string | null) {
            const source = absolute(from);
            const target = absolute(to);
            const [fromStat, toStat] = await Promise.all([
                lstat(source).catch(() => null),
                lstat(target).catch(() => null),
            ]);
            if (!fromStat) {
                return;
            }
            await openParents(target, readOnlyRoot);
            if (!toStat || toStat.ino === fromStat.ino) {
                await rename(source, target);
                return;
            }
            await unlink(source);
            await pruneEmptyParents(layout.folder, source);
        },
        async release(target: string) {
            await chmod(target, 0o644);
            return (await lstat(target)).mtimeMs;
        },
        walk: () => walkFolder(layout.folder),
        async relock() {
            const dirs = [...lockable].sort((a, b) => b.length - a.length);
            for (const dir of dirs) {
                await chmod(dir, 0o555).catch((error: NodeJS.ErrnoException) => {
                    if (error.code !== 'ENOENT') {
                        throw error;
                    }
                });
            }
        },
    };
}
export type FolderFiles = ReturnType<typeof folderFiles>;

export async function sha256File(path: string) {
    const hasher = new Bun.CryptoHasher('sha256');
    for await (const chunk of Bun.file(path).stream()) {
        hasher.update(chunk);
    }
    return hasher.digest('hex');
}

async function walkFolder(folder: string) {
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

async function holdsExactFile(target: string) {
    const stat = await lstat(target).catch(() => null);
    if (!stat?.isFile()) {
        return false;
    }
    const names = await readdir(dirname(target));
    return names.some((name) => name.normalize('NFC') === basename(target));
}

async function pruneEmptyParents(folder: string, target: string) {
    let dir = dirname(target);
    while (dir !== folder && dir.startsWith(`${folder}${sep}`)) {
        const removed = await rmdir(dir).then(
            () => true,
            (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST') {
                    return false;
                }
                throw error;
            }
        );
        if (!removed) {
            return;
        }
        dir = dirname(dir);
    }
}

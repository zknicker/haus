import { randomUUID } from 'node:crypto';
import { chmod, copyFile, link, lstat, mkdir, rename, rm, rmdir, unlink } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import {
    refuseSymlinkedParents,
    respellParents,
    SymlinkedFolderError,
    spellingOf,
} from './folder-spelling.ts';
import type { DriveFileRecord, DriveFolderLayout } from './folder-state.ts';
import { type FileStamp, sameStamp, stampOf, walkFolder } from './folder-walk.ts';

export interface LocalFile extends FileStamp {
    sha256: string;
}

export class LocalEditError extends Error {
    readonly code = 'ECHANGED';
    readonly syscall = 'copyfile';
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
            if (stat?.isSymbolicLink()) {
                throw new SymlinkedFolderError(
                    relative(layout.folder, target).split(sep).join('/')
                );
            }
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
            await refuseSymlinkedParents(layout.folder, path);
            const stat = await lstat(absolute(path)).catch(() => null);
            if (!stat) {
                return null;
            }
            if (!stat.isFile()) {
                return 'blocked' as const;
            }
            if ((await spellingOf(layout.folder, path)) !== 'exact') {
                return 'variant' as const;
            }
            if (record && stat.size === record.size_bytes && stat.mtimeMs === record.mtime_ms) {
                return { ...stampOf(stat), sha256: record.sha256 } satisfies LocalFile;
            }
            return {
                ...stampOf(stat),
                sha256: await sha256File(absolute(path)),
            } satisfies LocalFile;
        },
        async stamp(path: string) {
            await refuseSymlinkedParents(layout.folder, path);
            const stat = await lstat(absolute(path)).catch(() => null);
            return stat ? stampOf(stat) : null;
        },
        async snapshot(path: string) {
            const source = absolute(path);
            await refuseSymlinkedParents(layout.folder, path);
            const before = stampOf(await lstat(source));
            await mkdir(layout.scratch, { mode: 0o700, recursive: true });
            const file = join(layout.scratch, randomUUID());
            await copyFile(source, file);
            const after = stampOf(await lstat(source));
            if (!sameStamp(before, after)) {
                throw new LocalEditError(`${path} changed while it was read, so it waits a push.`);
            }
            return { file, sha256: await sha256File(file), stamp: after };
        },
        async placeIfUnchanged(
            path: string,
            source: string,
            readOnlyRoot: string | null,
            expected: FileStamp | null
        ) {
            const target = absolute(path);
            await openParents(target, readOnlyRoot);
            const stat = await lstat(target).catch(() => null);
            if (!sameStamp(stat && stampOf(stat), expected)) {
                return null;
            }
            await chmod(source, readOnlyRoot === null ? 0o644 : 0o444);
            await rename(source, target);
            return (await lstat(target)).mtimeMs;
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
            await refuseSymlinkedParents(layout.folder, path);
            if ((await spellingOf(layout.folder, path)) !== 'exact') {
                return;
            }
            await openParents(target, readOnlyRoot);
            await unlink(target);
            await pruneEmptyParents(layout.folder, target);
        },
        async setAside(path: string, target: string, sha256: string, readOnlyRoot: string | null) {
            const source = absolute(path);
            await openParents(source, readOnlyRoot);
            const inFolder = relative(layout.folder, target);
            if (!inFolder.startsWith('..')) {
                await refuseSymlinkedParents(layout.folder, inFolder.split(sep).join('/'));
            }
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
            const spelling = await spellingOf(layout.folder, path);
            return spelling === 'linked' ? ('other' as const) : spelling;
        },
        async respell(from: string, to: string, readOnlyRoot: string | null) {
            const source = absolute(from);
            const target = absolute(to);
            await refuseSymlinkedParents(layout.folder, from);
            await refuseSymlinkedParents(layout.folder, to);
            const [fromStat, toStat] = await Promise.all([
                lstat(source).catch(() => null),
                lstat(target).catch(() => null),
            ]);
            if (!fromStat) {
                return [{ from, to }];
            }
            if (toStat && toStat.ino !== fromStat.ino) {
                return null;
            }
            await openParents(target, readOnlyRoot);
            const parents = await respellParents(layout.folder, to);
            await rename(source, target);
            return [...parents, { from, to }];
        },
        async release(target: string) {
            await chmod(target, 0o644);
            return (await lstat(target)).mtimeMs;
        },
        underLink: (path: string) =>
            refuseSymlinkedParents(layout.folder, path).then(
                () => false,
                (error: unknown) => {
                    if (error instanceof SymlinkedFolderError) {
                        return true;
                    }
                    throw error;
                }
            ),
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

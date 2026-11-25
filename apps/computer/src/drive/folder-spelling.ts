import { lstat, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

export type Spelling = 'exact' | 'linked' | 'none' | 'other' | 'variant';

export class SymlinkedFolderError extends Error {
    readonly code = 'ESYMLINKFOLDER';
    readonly path: string;
    readonly syscall = 'lstat';

    constructor(path: string) {
        super(`${path} sits under a symbolic link, so Drive sync leaves it alone.`);
        this.path = path;
    }
}

export async function spellingOf(folder: string, path: string) {
    const segments = path.split('/');
    let dir = folder;
    let exact = true;
    for (const [index, segment] of segments.entries()) {
        const name = await nameOnDisk(dir, segment);
        if (name === null) {
            return 'none' satisfies Spelling;
        }
        exact &&= name.normalize('NFC') === segment;
        dir = join(dir, name);
        const stat = await lstat(dir);
        const last = index === segments.length - 1;
        if (stat.isSymbolicLink()) {
            return (last ? 'other' : 'linked') satisfies Spelling;
        }
        if (last) {
            return (stat.isFile() ? (exact ? 'exact' : 'variant') : 'other') satisfies Spelling;
        }
        if (!stat.isDirectory()) {
            return 'none' satisfies Spelling;
        }
    }
    return 'none' satisfies Spelling;
}

export async function refuseSymlinkedParents(folder: string, path: string) {
    const segments = path.split('/').slice(0, -1);
    let dir = folder;
    for (const segment of segments) {
        dir = join(dir, segment);
        const stat = await lstat(dir).catch(() => null);
        if (!stat) {
            return;
        }
        if (stat.isSymbolicLink()) {
            throw new SymlinkedFolderError(path);
        }
    }
}

export async function respellParents(folder: string, path: string) {
    const segments = path.split('/').slice(0, -1);
    const renamed: { from: string; to: string }[] = [];
    let dir = folder;
    for (const [index, segment] of segments.entries()) {
        const name = await nameOnDisk(dir, segment);
        if (name === null) {
            return renamed;
        }
        if (name.normalize('NFC') !== segment) {
            await rename(join(dir, name), join(dir, segment));
            const prefix = segments.slice(0, index).join('/');
            const at = (part: string) => (prefix ? `${prefix}/${part}` : part);
            renamed.push({ from: at(name.normalize('NFC')), to: at(segment) });
        }
        dir = join(dir, segment);
    }
    return renamed;
}

async function nameOnDisk(dir: string, segment: string) {
    const names = await readdir(dir).catch(() => null);
    if (names === null) {
        return null;
    }
    const exact = names.find((name) => name.normalize('NFC') === segment);
    if (exact !== undefined) {
        return exact;
    }
    const resolved = await lstat(join(dir, segment)).catch(() => null);
    if (!resolved) {
        return null;
    }
    for (const name of names) {
        const stat = await lstat(join(dir, name)).catch(() => null);
        if (stat?.ino === resolved.ino && stat.dev === resolved.dev) {
            return name;
        }
    }
    return null;
}

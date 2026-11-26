import { chmod, lstat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { hasCode } from './durable-json.ts';

export async function removeTree(path: string) {
    await unlockDirectories(path);
    await rm(path, { force: true, recursive: true });
}

async function unlockDirectories(path: string) {
    const stat = await lstat(path).catch((cause: unknown) => {
        if (hasCode(cause, 'ENOENT')) {
            return null;
        }
        throw cause;
    });
    if (!stat?.isDirectory()) {
        return;
    }
    await chmod(path, 0o700);
    for (const entry of await readdir(path)) {
        await unlockDirectories(join(path, entry));
    }
}

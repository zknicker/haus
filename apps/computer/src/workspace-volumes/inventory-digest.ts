import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readlink } from 'node:fs/promises';
import { join } from 'node:path';

export async function inventoryDigest(root: string, ignoredRootEntries = new Set<string>()) {
    const digest = createHash('sha256');
    async function visit(relative: string): Promise<void> {
        const path = join(root, relative);
        const info = await lstat(path);
        if (relative) {
            digest.update(JSON.stringify([relative, info.mode & 0o7777]));
        }
        if (info.isSymbolicLink()) {
            digest.update(`link:${await readlink(path)}`);
        } else if (info.isDirectory()) {
            const entries = await readdir(path, { withFileTypes: true });
            entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
            for (const entry of entries) {
                if (!relative && entry.isDirectory() && ignoredRootEntries.has(entry.name)) {
                    continue;
                }
                await visit(join(relative, entry.name));
            }
        } else if (info.isFile()) {
            digest.update(`file:${info.size}:`);
            for await (const chunk of createReadStream(path)) {
                digest.update(chunk);
            }
        } else {
            throw new Error(`Workspace contains an unsupported special file: ${relative}`);
        }
    }
    await visit('');
    return digest.digest('hex');
}

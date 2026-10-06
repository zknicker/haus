import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';

/** Retain outgoing bytes while checking for an edit at the replacement boundary. */
export async function refreshCoveGuidanceFile(
    destination: string,
    content: string,
    recognizedHashes: readonly string[]
): Promise<boolean> {
    const suffix = `${process.pid}-${randomUUID()}`;
    const temporary = `${destination}.haus-refresh-${suffix}`;
    const backup = `${destination}.haus-refresh-backup-${suffix}`;
    let keepBackup = false;
    try {
        const pending = await fs.open(temporary, 'wx', 0o600);
        try {
            await pending.writeFile(content);
            await pending.sync();
        } finally {
            await pending.close();
        }
        await fs.link(destination, backup);
        const actual = await fs.readFile(backup);
        const hash = createHash('sha256').update(actual).digest('hex');
        const [before, current] = await Promise.all([fs.stat(backup), fs.stat(destination)]);
        if (!recognizedHashes.includes(hash) || before.ino !== current.ino) {
            return false;
        }
        await fs.rename(temporary, destination);
        const outgoing = await fs.readFile(backup);
        if (!outgoing.equals(actual)) {
            keepBackup = true;
            const installed = await fs.readFile(destination);
            if (installed.equals(Buffer.from(content))) {
                await fs.rename(backup, destination);
            }
            return false;
        }
        return true;
    } catch (error) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ENOENT'
        ) {
            return false;
        }
        throw error;
    } finally {
        await fs.rm(temporary, { force: true });
        if (!keepBackup) {
            await fs.rm(backup, { force: true });
        }
    }
}

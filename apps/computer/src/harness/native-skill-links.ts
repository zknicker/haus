import { lstat, mkdir, readlink, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export async function ensureNativeSkillLinks(homeDir: string, skillsDir: string) {
    for (const nativeDir of ['.agents', '.claude']) {
        const parent = join(homeDir, nativeDir);
        const target = join(parent, 'skills');
        await mkdir(parent, { mode: 0o700, recursive: true });
        const current = await lstat(target).catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw error;
        });
        if (current?.isSymbolicLink()) {
            if ((await readlink(target)) === skillsDir) {
                continue;
            }
            await unlink(target);
        } else if (current) {
            throw new Error(`${target} is not a skill library link.`);
        }
        await symlink(skillsDir, target, 'dir');
    }
}

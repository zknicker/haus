import { mkdir, readlink, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The skills manifest `@ai-sdk/harness` keeps in a native skill directory. Haus passes harnesses
 * no skills and patches them to write none, but earlier Computers let an empty one land in every
 * Agent library through these links; it is removed before each turn.
 */
const HARNESS_SKILLS_MANIFEST = '.ai-sdk-harness-skills.json';

/** Links the shared skill set into each runtime-native home. */
export async function ensureNativeSkillLinks(homeDir: string, skillsDir: string): Promise<void> {
    await rm(join(skillsDir, HARNESS_SKILLS_MANIFEST), { force: true });
    for (const nativeDir of ['.agents', '.claude']) {
        const parent = join(homeDir, nativeDir);
        const target = join(parent, 'skills');
        await mkdir(parent, { mode: 0o700, recursive: true });
        try {
            await symlink(skillsDir, target, 'dir');
        } catch (cause) {
            const linksSharedSkills =
                cause !== null &&
                typeof cause === 'object' &&
                'code' in cause &&
                cause.code === 'EEXIST' &&
                (await readlink(target)) === skillsDir;
            if (!linksSharedSkills) {
                throw cause;
            }
        }
    }
}

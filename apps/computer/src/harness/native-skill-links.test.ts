import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureNativeSkillLinks } from './native-skill-links.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('links every native skill directory to the library and clears a stale harness manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-native-skill-links-'));
    roots.push(root);
    const homeDir = join(root, 'home');
    const skillsDir = join(root, 'skills');
    await mkdir(join(skillsDir, 'kept-skill'), { recursive: true });
    await writeFile(
        join(skillsDir, '.ai-sdk-harness-skills.json'),
        JSON.stringify({
            skills: [{ hash: 'h', name: 'kept-skill' }],
            state: 'complete',
            version: 1,
        })
    );

    await ensureNativeSkillLinks(homeDir, skillsDir);
    await ensureNativeSkillLinks(homeDir, skillsDir);

    expect(await readdir(skillsDir)).toEqual(['kept-skill']);
    expect(await readlink(join(homeDir, '.agents', 'skills'))).toBe(skillsDir);
    expect(await readlink(join(homeDir, '.claude', 'skills'))).toBe(skillsDir);
});

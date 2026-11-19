import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readlink, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentDrive } from '../drive/agent-drive.ts';
import { ensureNativeSkillLinks } from './native-skill-links.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function agentRoot() {
    const root = await mkdtemp(join(tmpdir(), 'haus-native-skill-links-'));
    roots.push(root);
    return root;
}

test('links every native skill directory to the Drive skill library', async () => {
    const root = await agentRoot();
    const homeDir = join(root, 'home');
    const { skills } = agentDrive(root, 'scout');

    await ensureNativeSkillLinks(homeDir, skills);
    await ensureNativeSkillLinks(homeDir, skills);

    expect(await readlink(join(homeDir, '.agents', 'skills'))).toBe(skills);
    expect(await readlink(join(homeDir, '.claude', 'skills'))).toBe(skills);
});

test('repoints links that still name the legacy library, and refuses a real directory', async () => {
    const root = await agentRoot();
    const homeDir = join(root, 'home');
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await mkdir(join(homeDir, '.claude', 'skills'), { recursive: true });
    await symlink(join(root, 'skills'), join(homeDir, '.agents', 'skills'), 'dir');
    const { skills } = agentDrive(root, 'scout');

    await expect(ensureNativeSkillLinks(homeDir, skills)).rejects.toThrow(
        `${join(homeDir, '.claude', 'skills')} is not a skill library link.`
    );
    expect(await readlink(join(homeDir, '.agents', 'skills'))).toBe(skills);
});

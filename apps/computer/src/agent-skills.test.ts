import { beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createLocalAgentSkill,
    deleteLocalAgentSkill,
    listLocalAgentSkills,
    patchLocalAgentSkill,
    viewLocalAgentSkill,
    writeLocalAgentSkillFile,
} from './agent-skills.ts';

let root: string;

beforeEach(async () => {
    if (root) {
        await rm(root, { force: true, recursive: true });
    }
    root = await mkdtemp(join(tmpdir(), 'haus-skills-'));
});

test('supports the proven Agent skill lifecycle with optimistic hash checks', async () => {
    const created = await createLocalAgentSkill(root, {
        content: '# Release checks\n\nVerify releases.',
        description: 'Verify releases',
        name: 'Release Checks',
    });
    expect(created.skill.id).toBe('release-checks');
    expect((await listLocalAgentSkills(root)).skills).toEqual([
        {
            description: 'Release checks',
            id: 'release-checks',
            name: 'release-checks',
        },
    ]);

    const viewed = await viewLocalAgentSkill(root, 'release-checks');
    const patched = await patchLocalAgentSkill(root, {
        content: '# Release checks\n\nVerify signed releases.',
        expectedHash: viewed.hash,
        skillId: 'release-checks',
    });
    expect(patched.change.beforeHash).toBe(viewed.hash);

    const support = await writeLocalAgentSkillFile(root, {
        content: 'checklist',
        expectedHash: null,
        filePath: 'references/checklist.md',
        skillId: 'release-checks',
    });
    expect(support.change.path).toBe('references/checklist.md');
    expect((await viewLocalAgentSkill(root, 'release-checks')).supportFiles).toHaveLength(1);

    await deleteLocalAgentSkill(root, 'agt_test', 'release-checks');
    expect((await listLocalAgentSkills(root)).skills).toEqual([]);
});

test('rejects traversal and symlink escapes from the Agent skill library', async () => {
    await createLocalAgentSkill(root, {
        content: '# Safe',
        description: 'Safe',
        name: 'safe',
    });
    await expect(
        writeLocalAgentSkillFile(root, {
            content: 'nope',
            expectedHash: null,
            filePath: 'references/../../outside',
            skillId: 'safe',
        })
    ).rejects.toThrow('must stay under');

    const outside = await mkdtemp(join(tmpdir(), 'haus-skills-outside-'));
    await mkdir(join(root, 'safe', 'references'), { recursive: true });
    await symlink(outside, join(root, 'safe', 'references', 'escape'));
    await expect(
        writeLocalAgentSkillFile(root, {
            content: 'nope',
            expectedHash: null,
            filePath: 'references/escape/file.md',
            skillId: 'safe',
        })
    ).rejects.toThrow('symlink');
    await expect(readFile(join(outside, 'file.md'), 'utf8')).rejects.toThrow();
    await rm(outside, { force: true, recursive: true });
});

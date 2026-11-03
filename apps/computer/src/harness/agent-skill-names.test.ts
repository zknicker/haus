import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultVisualsSkill } from '@haus/agent-workspace';
import { readAgentSkillNames } from './agent-skill-names.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('prefers the frontmatter name and rejects an unusable one', async () => {
    const skillsDir = await makeSkillsDir({
        'dir-name': ['---', 'name: ../escape', '---', '', '# E'].join('\n'),
        quoted: ['---', 'name: "quoted-name"', '---', '', '# Q'].join('\n'),
        renamed: ['---', 'name: front-name', 'description: Renamed.', '---', '', '# R'].join('\n'),
    });

    expect(await readAgentSkillNames(skillsDir)).toEqual(['dir-name', 'quoted-name', 'front-name']);
});

test('names a bare skill by its directory and skips directories without SKILL.md', async () => {
    const skillsDir = await makeSkillsDir({ bare: '# Bare skill\n\nSome body.\n' });
    await mkdir(join(skillsDir, 'not-a-skill'));

    expect(await readAgentSkillNames(skillsDir)).toEqual(['bare']);
    expect(await readAgentSkillNames(join(skillsDir, 'missing'))).toEqual([]);
});

test('the seeded visuals skill is listed by its authored name', async () => {
    const skillsDir = await makeSkillsDir({ visuals: defaultVisualsSkill });

    expect(await readAgentSkillNames(skillsDir)).toEqual(['visuals']);
});

async function makeSkillsDir(bundles: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'haus-agent-skills-'));
    roots.push(root);
    for (const [name, content] of Object.entries(bundles)) {
        await mkdir(join(root, name), { recursive: true });
        await writeFile(join(root, name, 'SKILL.md'), content);
    }
    return root;
}

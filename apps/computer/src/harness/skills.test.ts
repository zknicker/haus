import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultVisualsSkill } from '@haus/agent-workspace';
import { readAgentSkills } from './skills.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('reads the authored frontmatter description, not the frontmatter fence', async () => {
    const skillsDir = await makeSkillsDir({
        visuals: [
            '---',
            'name: visuals',
            'description: >',
            '  Haus design system for everything you render — inline visuals',
            '  and pages. Read this BEFORE emitting any fence.',
            '---',
            '',
            '# Visuals',
            '',
            'Body text.',
        ].join('\n'),
    });

    const skills = await readAgentSkills(skillsDir);

    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('visuals');
    expect(skills[0]?.description).toBe(
        'Haus design system for everything you render — inline visuals and pages. Read this BEFORE emitting any fence.'
    );
    // The whole file stays the skill content; adapters add their own frontmatter.
    expect(skills[0]?.content).toContain('description: >');
    expect(skills[0]?.content).toContain('Body text.');
});

test('reads literal block, quoted, and plain descriptions', async () => {
    const skillsDir = await makeSkillsDir({
        literal: [
            '---',
            'description: |',
            '  First line.',
            '  Second line.',
            '---',
            '',
            '# L',
        ].join('\n'),
        plain: ['---', 'description: Plain and short.', '---', '', '# P'].join('\n'),
        quoted: ['---', 'description: "Quoted, with a comma."', '---', '', '# Q'].join('\n'),
    });

    const skills = await readAgentSkills(skillsDir);

    expect(descriptions(skills)).toEqual({
        literal: 'First line. Second line.',
        plain: 'Plain and short.',
        quoted: 'Quoted, with a comma.',
    });
});

test('falls back to the first meaningful line after the frontmatter', async () => {
    const skillsDir = await makeSkillsDir({
        bare: '# Bare skill\n\nSome body.\n',
        'no-description': ['---', 'name: no-description', '---', '', '# Titled skill', ''].join(
            '\n'
        ),
    });

    const skills = await readAgentSkills(skillsDir);

    expect(descriptions(skills)).toEqual({
        bare: 'Bare skill',
        'no-description': 'Titled skill',
    });
});

test('prefers the frontmatter name and rejects an unusable one', async () => {
    const skillsDir = await makeSkillsDir({
        'dir-name': [
            '---',
            'name: ../escape',
            'description: Escaping name.',
            '---',
            '',
            '# E',
        ].join('\n'),
        renamed: ['---', 'name: front-name', 'description: Renamed.', '---', '', '# R'].join('\n'),
    });

    const skills = await readAgentSkills(skillsDir);

    expect(skills.map((skill) => skill.name).sort()).toEqual(['dir-name', 'front-name']);
});

test('quotes a description that would break the frontmatter adapters render', async () => {
    const skillsDir = await makeSkillsDir({
        colon: [
            '---',
            'description: Renders two things: visuals and artifacts.',
            '---',
            '',
            '# C',
        ].join('\n'),
    });

    const skills = await readAgentSkills(skillsDir);

    expect(skills[0]?.description).toBe('"Renders two things: visuals and artifacts."');
});

test('the seeded visuals skill lists its authored description', async () => {
    const skillsDir = await makeSkillsDir({ visuals: defaultVisualsSkill });

    const skills = await readAgentSkills(skillsDir);

    expect(skills[0]?.description.startsWith('Haus design system')).toBe(true);
    expect(skills[0]?.description).not.toContain('---');
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

function descriptions(skills: { description: string; name: string }[]): Record<string, string> {
    return Object.fromEntries(skills.map((skill) => [skill.name, skill.description]));
}

import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { visualsSkillId } from '../../../packages/agent-workspace/src/index.ts';
import { overrideVisualsSkill } from './skill-override.mjs';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

/** A temp root holding a seeded skill (today's layout) and an empty revision dir. */
const scratch = async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'visuals-lab-override-'));
    roots.push(root);
    const skillsDir = path.join(root, 'skills');
    const seeded = path.join(skillsDir, visualsSkillId);
    await mkdir(path.join(seeded, 'references', 'fragments'), { recursive: true });
    await writeFile(path.join(seeded, 'SKILL.md'), 'seeded skill\n');
    await writeFile(path.join(seeded, 'references', 'design-system.md'), 'seeded tokens\n');
    await writeFile(path.join(seeded, 'references', 'charts.md'), 'seeded charts\n');
    await writeFile(path.join(seeded, 'references', 'fragments', 'kpi-row.md'), 'new fence\n');
    await writeFile(path.join(seeded, 'references', 'fragments', 'donut.md'), 'new fence\n');
    // The generated icon assets are not skill text and must survive untouched.
    await mkdir(path.join(seeded, 'references', 'icons'), { recursive: true });
    await writeFile(path.join(seeded, 'references', 'icons', 'chart.svg'), '<svg/>');
    const revision = path.join(root, 'revision');
    await mkdir(revision, { recursive: true });
    return { revision, seeded, skillsDir };
};

test('a revision that predates fragments/ leaves none of the new fences behind', async () => {
    const { revision, seeded, skillsDir } = await scratch();
    await writeFile(path.join(revision, 'SKILL.md'), 'old skill\n');
    await writeFile(path.join(revision, 'design-system.md'), 'old tokens\n');

    const applied = await overrideVisualsSkill(skillsDir, revision);

    expect(applied).toEqual(['SKILL.md', 'design-system.md']);
    expect(await readFile(path.join(seeded, 'SKILL.md'), 'utf8')).toBe('old skill\n');
    expect(await readFile(path.join(seeded, 'references', 'design-system.md'), 'utf8')).toBe(
        'old tokens\n'
    );
    expect(existsSync(path.join(seeded, 'references', 'charts.md'))).toBe(false);
    expect(existsSync(path.join(seeded, 'references', 'fragments'))).toBe(false);
    expect(existsSync(path.join(seeded, 'references', 'icons', 'chart.svg'))).toBe(true);
});

test('a revision that carries fragments/ replaces the seeded set rather than adding to it', async () => {
    const { revision, seeded, skillsDir } = await scratch();
    await writeFile(path.join(revision, 'SKILL.md'), 'old skill\n');
    await mkdir(path.join(revision, 'fragments'), { recursive: true });
    await writeFile(path.join(revision, 'fragments', 'kpi-row.md'), 'old fence\n');

    const applied = await overrideVisualsSkill(skillsDir, revision);

    expect(applied).toEqual(['SKILL.md', 'fragments/kpi-row.md']);
    expect(await readdir(path.join(seeded, 'references', 'fragments'))).toEqual(['kpi-row.md']);
    expect(await readFile(path.join(seeded, 'references', 'fragments', 'kpi-row.md'), 'utf8')).toBe(
        'old fence\n'
    );
});

test('a directory without SKILL.md is refused rather than half-applied', async () => {
    const { revision, seeded, skillsDir } = await scratch();
    await writeFile(path.join(revision, 'design-system.md'), 'old tokens\n');

    expect(overrideVisualsSkill(skillsDir, revision)).rejects.toThrow('carries no SKILL.md');
    expect(await readFile(path.join(seeded, 'references', 'design-system.md'), 'utf8')).toBe(
        'seeded tokens\n'
    );
});

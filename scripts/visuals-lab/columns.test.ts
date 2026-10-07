import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { columnById, readColumns, readSkills } from './columns.mjs';

const lineup = [
    {
        id: 'opus',
        label: 'Opus',
        model: 'claude-opus',
        reasoning: 'medium',
        runtime: 'claude-code',
    },
    { id: 'grok', label: 'Grok', model: 'grok-4.6', reasoning: 'medium', runtime: 'grok-build' },
];

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const variantsRoot = async (variants: Record<string, { lab?: string; skill?: boolean }>) => {
    const root = await mkdtemp(path.join(tmpdir(), 'visuals-lab-variants-'));
    roots.push(root);
    for (const [name, { lab, skill = true }] of Object.entries(variants)) {
        await mkdir(path.join(root, name), { recursive: true });
        if (skill) {
            await writeFile(path.join(root, name, 'SKILL.md'), '# skill\n');
        }
        if (lab !== undefined) {
            await writeFile(path.join(root, name, 'lab.json'), lab);
        }
    }
    return root;
};

test('without variants there is one skill, Current, and column ids are the model ids', () => {
    const dir = path.join(tmpdir(), 'visuals-lab-no-such-dir');
    expect(readSkills(dir).map((skill) => [skill.id, skill.label])).toEqual([
        ['current', 'Current'],
    ]);
    const columns = readColumns(lineup, dir);
    expect(columns.map((column) => column.id)).toEqual(['opus', 'grok']);
    expect(columns.every((column) => column.skillDir === null)).toBe(true);
});

test('every model crosses every skill, and a revision column runs its own skill dir', async () => {
    const root = await variantsRoot({ v2: {}, wide: {} });
    expect(readSkills(root).map((skill) => skill.label)).toEqual(['Current', 'v2', 'wide']);
    const columns = readColumns(lineup, root);
    expect(columns.map((column) => [column.id, column.modelId, column.skill])).toEqual([
        ['opus', 'opus', 'current'],
        ['opus@v2', 'opus', 'v2'],
        ['opus@wide', 'opus', 'wide'],
        ['grok', 'grok', 'current'],
        ['grok@v2', 'grok', 'v2'],
        ['grok@wide', 'grok', 'wide'],
    ]);
    expect(columnById('opus@v2', columns)).toMatchObject({
        label: 'Opus',
        model: 'claude-opus',
        skillDir: path.join(root, 'v2'),
    });
});

test('directories without a SKILL.md, with an unsafe name, or named current are skipped', async () => {
    const root = await variantsRoot({ Bad_Name: {}, current: {}, 'no-skill': { skill: false } });
    expect(readSkills(root).map((skill) => skill.id)).toEqual(['current']);
    expect(readColumns(lineup, root).map((column) => column.id)).toEqual(['opus', 'grok']);
});

test('a revision whose lab.json asks for preview runs its columns with preview', async () => {
    const root = await variantsRoot({
        plain: {},
        quiet: { lab: '{"preview": false}' },
        seen: { lab: '{"preview": true}' },
    });
    expect(readSkills(root).map((skill) => [skill.id, skill.preview])).toEqual([
        ['current', false],
        ['plain', false],
        ['quiet', false],
        ['seen', true],
    ]);
    const previewing = readColumns(lineup, root).filter((column) => column.preview);
    expect(previewing.map((column) => column.id)).toEqual(['opus@seen', 'grok@seen']);
});

test('a malformed lab.json is an error, not a silent default', async () => {
    const root = await variantsRoot({ broken: { lab: '{preview: true' } });
    expect(() => readSkills(root)).toThrow(/lab\.json is not valid JSON/u);
});

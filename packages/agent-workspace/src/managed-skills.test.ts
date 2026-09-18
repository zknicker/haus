import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    defaultVisualsSkill,
    seedFactoryManagedSkills,
    visualsSkillFiles,
} from './managed-skills.ts';

/** The topic modules, in reading order. The core is always read; one module follows. */
const skillModules = [
    'design-system.md',
    'charts.md',
    'diagrams.md',
    'components.md',
    'pages.md',
    'icons.md',
];

const moduleSource = (name: string) => visualsSkillFiles[`references/${name}`] ?? '';
const everySkillSource = () => [defaultVisualsSkill, ...skillModules.map(moduleSource)];

let skillsDir = '';

beforeEach(async () => {
    skillsDir = await mkdtemp(join(tmpdir(), 'haus-managed-skills-'));
});

afterEach(async () => {
    await rm(skillsDir, { force: true, recursive: true });
});

test('restores visuals without removing authored or stale factory skills', async () => {
    await mkdir(join(skillsDir, 'authored'), { recursive: true });
    await writeFile(join(skillsDir, 'authored', 'SKILL.md'), '# Authored\n');
    await mkdir(join(skillsDir, 'haus-agent'), { recursive: true });
    await writeFile(join(skillsDir, 'haus-agent', 'SKILL.md'), '# stale\n');

    await seedFactoryManagedSkills(skillsDir);

    await expect(readFile(join(skillsDir, 'authored', 'SKILL.md'), 'utf8')).resolves.toBe(
        '# Authored\n'
    );
    await expect(readFile(join(skillsDir, 'haus-agent', 'SKILL.md'), 'utf8')).resolves.toBe(
        '# stale\n'
    );
    await expect(readFile(join(skillsDir, 'visuals', 'SKILL.md'), 'utf8')).resolves.toBe(
        defaultVisualsSkill
    );
    await expect(
        readFile(join(skillsDir, 'visuals', 'references', 'design-system.md'), 'utf8')
    ).resolves.toContain('# Haus visuals — design system');
});

test('every visuals module seeds into references/', async () => {
    await seedFactoryManagedSkills(skillsDir);

    for (const name of skillModules) {
        await expect(
            readFile(join(skillsDir, 'visuals', 'references', name), 'utf8')
        ).resolves.toContain('# Haus visuals');
    }
});

/**
 * The core is always read and one module follows it, so the core has to say
 * which — a module nothing routes to is a module nothing reads.
 */
test('the core and the skill both route to every module', () => {
    const core = moduleSource('design-system.md');

    for (const name of skillModules.filter((module) => module !== 'design-system.md')) {
        expect(core).toContain(`(${name})`);
        expect(defaultVisualsSkill).toContain(`references/${name}`);
    }
});

test('visuals skill states the visual frame facts', () => {
    expect(defaultVisualsSkill).toContain('renders inline in the reply column');
    expect(defaultVisualsSkill).toContain('chat transcript owns vertical scrolling');
    expect(defaultVisualsSkill).not.toContain('about 700px');
    // The frame stopped being a card: transparent, unbordered, no side gutter
    // of its own. An agent that still reads "already a card" draws a card in a
    // card, so the retired wording is pinned out.
    expect(defaultVisualsSkill).toContain('transparent, with no border');
    expect(defaultVisualsSkill).toContain('no side padding');
    expect(defaultVisualsSkill).toContain('The conversation is the container');
    expect(defaultVisualsSkill).not.toContain('already a card');
    expect(defaultVisualsSkill).not.toContain('16px padding');
    expect(defaultVisualsSkill).toContain('the app font');
    expect(defaultVisualsSkill).toContain('14px text');
    // The description ends with the words users actually type, so the skill
    // listing matches a chart or calendar request that never says "visual".
    for (const trigger of ['chart', 'dashboard', 'KPI row', 'calendar', 'revenue', 'cash flow']) {
        expect(defaultVisualsSkill.split('\n---\n')[0]).toContain(trigger);
    }
});

/**
 * The design system is a second file read, and a model that skips it still
 * writes a visual. The non-negotiables block is the floor that survives that
 * skip, so it has to exist and has to sit ahead of the pointer that asks for
 * the second read.
 */
test('visuals skill states the non-negotiables before the design-system pointer', () => {
    expect(defaultVisualsSkill).toContain('## Non-negotiables');
    expect(defaultVisualsSkill.indexOf('## Non-negotiables')).toBeLessThan(
        defaultVisualsSkill.indexOf('Required: read the design system')
    );
    expect(defaultVisualsSkill).toContain('`maxBarThickness: 48`');
    expect(defaultVisualsSkill).toContain('Round every number that reaches the screen');
    expect(defaultVisualsSkill).toContain('No mid-sentence bolding in the reply');
    // Text on the surface is the raw role token; `--error-foreground` is text
    // on the matching tint and lands near-invisible on the page.
    expect(defaultVisualsSkill).toContain('`var(--error)` message inline');
});

/**
 * The skill used to send every table into the visual frame, which made a reply
 * a caption and a visual a wall. The split is now the other way round, and it
 * is the whole point of the composition rules — so both halves are pinned,
 * including the retired ban, which an agent would still obey if it survived
 * anywhere in the file. Pins run against flowed text: these sentences are
 * wrapped in the source and rewrapping them must not silently drop a pin.
 */
test('visuals skill sends tables to the reply and keeps the visual to one idea', () => {
    const flowed = flowText(defaultVisualsSkill);

    expect(flowed).toContain('A visual does only what text cannot');
    expect(flowed).toContain('Tables, lists, and explanation go in the reply');
    expect(flowed).toContain(
        'tiles above one chart, or one chart, or one diagram — tables go in the reply'
    );
    expect(flowed).toContain('then Markdown tables for the detail');
    expect(flowed).not.toContain('never a Markdown table');
    // The description drives skill matching, so a table request must stop
    // pulling the visuals skill in on the word alone.
    expect(flowText(defaultVisualsSkill.split('\n---\n')[0] ?? '')).not.toContain('table');
});

test('visuals design system puts tables in the reply', () => {
    const designSystem = flowText(moduleSource('design-system.md'));

    expect(designSystem).toContain('Tables live in the reply as Markdown');
    expect(flowText(moduleSource('charts.md'))).toContain(
        'More than ~7 classes | A Markdown table in the reply'
    );
    for (const source of everySkillSource()) {
        expect(source).not.toContain('A table is its own visual');
    }
});

function flowText(text: string) {
    return text.replace(/\s+/gu, ' ');
}

test('visuals charts module sizes bars to the slot', () => {
    const charts = moduleSource('charts.md');

    for (const source of everySkillSource()) {
        expect(source).not.toContain('maxBarThickness: 24');
        expect(source).not.toContain('maxBarThickness: 32');
    }
    expect(charts).toContain('maxBarThickness: 48');
    expect(charts).toContain('categoryPercentage: 0.55');
    expect(charts).toContain("interaction: { intersect: false, mode: 'index' }");
});

test('visuals design system carries the hidden summary heading and the rounding rule', () => {
    const designSystem = moduleSource('design-system.md');

    // Stated as a rule in the core and opened with in every chart fragment, so
    // the house style carries it into anything copied from it.
    expect(designSystem).toContain('the one heading the no-headings rule allows');
    expect(designSystem).toContain(
        '<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">'
    );
    expect(designSystem).toContain('Round every number that reaches the screen');
    expect(designSystem).toContain('`-$5M`, never `$-5M`');
});

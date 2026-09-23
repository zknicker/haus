import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    fragmentFiles,
    skillModules,
} from '../../../scripts/visuals-lab/engine/skill-fragments.mjs';
import {
    defaultVisualsSkill,
    seedFactoryManagedSkills,
    visualsSkillFiles,
} from './managed-skills.ts';

const moduleSource = (name: string) => visualsSkillFiles[`references/${name}`] ?? '';
const everySkillSource = () => [
    defaultVisualsSkill,
    ...skillModules.map(moduleSource),
    ...fragmentFiles().map((file: string) => moduleSource(`fragments/${file}`)),
];

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

test('every visuals module and fragment seeds into references/', async () => {
    await seedFactoryManagedSkills(skillsDir);

    for (const name of skillModules) {
        await expect(
            readFile(join(skillsDir, 'visuals', 'references', name), 'utf8')
        ).resolves.toContain('# Haus visuals');
    }
    for (const file of fragmentFiles()) {
        await expect(
            readFile(join(skillsDir, 'visuals', 'references', 'fragments', file), 'utf8')
        ).resolves.toContain('```html');
    }
});

/**
 * A fragment nothing points at is a fragment nothing reads, and a link to a
 * file that does not seed is a dead read. Both halves are pinned because the
 * index tables are the whole navigation story now.
 */
test('every fragment is reachable from a module index', () => {
    const indexes = skillModules.map(moduleSource).join('\n');

    for (const file of fragmentFiles()) {
        expect(indexes, file).toContain(`(fragments/${file})`);
    }
    for (const [, link] of indexes.matchAll(/\(fragments\/([a-z0-9-]+\.md)\)/gu)) {
        expect(fragmentFiles(), link).toContain(link);
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
    expect(flowText(defaultVisualsSkill)).toContain('**One y-axis by default.**');
    expect(flowText(defaultVisualsSkill)).toContain('Bars are **at most 24px** wide');
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

    expect(flowed).toContain('show the essential inline; explain the rest in the reply');
    expect(flowed).toContain('write it as a Markdown table in the reply');
    // Placement only, as Claude's widget guidance does: nothing about reply
    // length or order, which read as an instruction to add tables.
    expect(flowed).not.toContain('a long reply is fine');
    expect(flowed).not.toContain('Compose the reply in order');
    expect(flowed).toContain(
        'tiles above one chart, or one chart, or one diagram — no table inside it'
    );
    expect(flowed).not.toContain('then Markdown tables for the detail');
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

/**
 * Charts are hand-written SVG: no library sizes a bar or reads a token for the
 * agent. The cap and the derivation are the two rules a copied fragment cannot
 * carry on its own, so both are pinned, along with the procedure that orders
 * the work and the anti-pattern catalog that closes it.
 */
test('visuals teaches the SVG procedure, the 24px cap, and one axis', () => {
    const marks = flowText(moduleSource('marks-and-anatomy.md'));

    for (const source of everySkillSource()) {
        expect(source).not.toContain('maxBarThickness');
        expect(source).not.toContain('categoryPercentage');
        expect(source).not.toContain('animation: false');
    }
    expect(defaultVisualsSkill).toContain('## Making a chart — do these in order');
    expect(defaultVisualsSkill).toContain('references/anti-patterns.md');
    expect(marks).toContain('**At most 24px** thick');
    expect(marks).toContain('const barW = Math.min(24, slot * 0.6);');
    expect(marks).toContain('**One y-axis by default.**');
    expect(flowText(moduleSource('charts.md'))).toContain(
        '[paired-panels](fragments/paired-panels.md)'
    );
    expect(flowText(moduleSource('interaction.md'))).toContain('class="tip"');
    // The viewBox fixes the geometry and the width fills the column; a pixel
    // height beside it letterboxes the plot.
    // A 736 viewBox is the 46rem reply column at 1:1, so chart text renders at
    // the app's own 12px and 14px tiers instead of scaling with the column.
    expect(defaultVisualsSkill).toContain(
        '<svg viewBox="0 0 736 240" width="100%" role="img" aria-label="…" style="display:block">'
    );
    expect(marks).toContain('<svg viewBox="0 0 736 240" width="100%" role="img" aria-label=');
    expect(marks).toContain('const W = 736, H = 240;');
    expect(defaultVisualsSkill).not.toContain('0 0 640');
    expect(marks).not.toContain('0 0 640');
    expect(marks).toContain('Never set a pixel `height` beside a percentage width on a plot.');
    expect(defaultVisualsSkill).not.toContain('height="240"');
    expect(marks).not.toContain('height="240"');
    expect(marks).not.toContain('fixed rendered height');
});

/**
 * Tick selection is where models improvised: a rounded maximum plus a "drop to
 * the next step" escape hatch left the step open, so one peak of $1,342 came
 * back as $1.2K in 300s, $1.5K in 500s, and $1.2K in 400s. One algorithm and
 * one label format close it. visuals-fragments.test.ts runs the snippet.
 */
test('visuals pins one tick algorithm and one tick format', () => {
    const marks = moduleSource('marks-and-anatomy.md');
    const recipe = [
        'const niceStep = (peak, intervals = 5) => {  // 1, 2 or 5 × 10^k',
        '  const raw = peak / intervals;',
        '  const pow = 10 ** Math.floor(Math.log10(raw));',
        '  const f = raw / pow;',
        '  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;',
        '};',
        'const peak = Math.max(...values);',
        'const step = niceStep(peak);',
        'const max = Math.ceil(peak / step) * step;',
        'const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);',
    ].join('\n');
    expect(marks).toContain(recipe);
    expect(flowText(marks)).toContain(
        'The step is always 1, 2 or 5 times a power of ten, the axis runs from zero to the first multiple of the step at or above the peak, which gives three to five intervals; never hand-pick a step.'
    );
    // Opus never opens this module, so the rule also rides its reading path.
    expect(flowText(defaultVisualsSkill)).toContain('smallest at or above peak/5, and the axis');
    expect(flowText(moduleSource('charts.md'))).toContain('peak/5, max = the first multiple of it');
    expect(flowText(marks)).toContain('**One tick format per axis, chosen by the top tick.**');
    expect(flowText(marks)).toContain(
        'A diverging axis takes its step from the whole span, negative to positive, then mirrors the max on both sides.'
    );
    expect(flowText(marks)).toContain('`$1,500`, not `$1.5K`');
    for (const source of everySkillSource()) {
        expect(source).not.toContain('niceMax');
        expect(flowText(source)).not.toContain('drop to the next step');
        expect(flowText(source)).not.toContain('four intervals, five labels');
    }
});

test('the anti-pattern catalog seeds beside the other modules', async () => {
    await seedFactoryManagedSkills(skillsDir);

    await expect(
        readFile(join(skillsDir, 'visuals', 'references', 'anti-patterns.md'), 'utf8')
    ).resolves.toContain('# Haus visuals — anti-patterns');
});

/**
 * The categorical slots are validated as a set and in that order, so the order
 * is the contract: numeric, never cycled, with red gone from the series
 * vocabulary entirely. The old 'red last' wording is pinned out because an
 * agent would still obey it if it survived anywhere.
 */
test('visuals teaches one fixed categorical order', () => {
    expect(moduleSource('design-system.md')).toContain(
        '`--chart-1` blue, `--chart-2` orange, `--chart-3` aqua, `--chart-4` yellow'
    );
    expect(flowText(moduleSource('charts.md'))).toContain(
        '`--chart-1` blue, then `--chart-2` orange, then `--chart-3` aqua, then `--chart-4` yellow'
    );
    for (const source of everySkillSource()) {
        expect(source).not.toContain('red last');
        expect(source).not.toContain('red **last**');
    }
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

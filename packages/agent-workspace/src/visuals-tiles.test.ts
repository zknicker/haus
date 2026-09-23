import { expect, test } from 'bun:test';
import {
    extractFragment,
    fragmentFiles,
    skillModules,
} from '../../../scripts/visuals-lab/engine/skill-fragments.mjs';
import { defaultVisualsSkill, visualsSkillFiles } from './managed-skills.ts';

/**
 * The tile grammar in components.md: one way to write a stat tile's title,
 * value and chip, so a KPI row reads the same whichever model wrote it.
 *
 * - Title: the metric; `Metric · period` only when the row mixes periods, and
 *   then on every tile except the bare `Today` not-synced tile.
 * - Value: whole through 9,999, compact from 10,000 with no trailing zero,
 *   percents one decimal below 10. Cents only for a per-unit figure.
 * - Chip: at most one, and exactly one shape. A change (`↑ 6.0% vs prior 7d`)
 *   wears success or error, or neutral when flat; a ratio (`48% of $30K
 *   goal`) is always neutral; a status (`Not synced yet`) is the only warning.
 *
 * The lists below are the contract: the pins build the prose sentences from
 * them, so the lint and the skill cannot drift apart.
 */
const comparators = [
    'prior 7d',
    'prior 30d',
    'prior day',
    'prior week',
    'prior month',
    '7d avg',
    '30d avg',
];
const month = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
const period = new RegExp(
    `^(?:today|yesterday|7d|30d|MTD|${month} \\d{1,2}(?:–(?:${month} )?\\d{1,2})?)$`,
    'u'
);
const percent = '(?:\\d\\.\\d|[1-9]\\d+)%';
const chipShapes = {
    // A count under 20 moves by its difference, a rate in pts.
    change: new RegExp(
        `^(?:[↑↓] (?:${percent}|\\d+(?:\\.\\d)? pts|1?\\d)|flat) vs (?:${comparators.join('|')})$`,
        'u'
    ),
    ratio: new RegExp(`^${percent} of .+$`, 'u'),
    status: /^(?:Not synced yet|No data)$/u,
};
const value = new RegExp(
    `^(?:—|-?\\$?(?:\\d{1,3}|\\d,\\d{3}|[1-9]\\d{1,2}(?:\\.[1-9])?K|[1-9]\\d{0,2}(?:\\.[1-9])?[MB])|${percent})$`,
    'u'
);
const perUnitValue = /^\$\d+\.\d{2}$/u;

const plateOpen =
    /<div style="background:var\(--surface-(?:secondary|tertiary)\);border-radius:var\(--radius\);padding:[^"]*">/gu;
const titleDiv = /^\s*<div style="font-size:12px;color:var\(--muted-foreground\)">([^<]*)<\/div>/u;
const valueDiv = /<div\b[^>]*font-size:(?:2[4-9]|3[0-6])px[^>]*>([^<]*)<\/div>/u;
const chipSpan =
    /<span\b[^>]*padding:1px 8px[^>]*background:var\((--[a-z-]+)\)[^>]*>([^<]*)<\/span>/gu;

interface Tile {
    chips: { background: string; text: string }[];
    title: string;
    value: string;
}

/** A tile is a plate that opens with a 12px muted title and holds a display value. */
function tilesIn(html: string): Tile[] {
    const tiles: Tile[] = [];
    for (const segment of html.split(plateOpen).slice(1)) {
        const title = titleDiv.exec(segment)?.[1];
        const shown = valueDiv.exec(segment)?.[1];
        if (title === undefined || shown === undefined) {
            continue;
        }
        const chips = [...segment.matchAll(chipSpan)].map(([, background, text]) => ({
            background: background ?? '',
            text: text ?? '',
        }));
        tiles.push({ chips, title, value: shown });
    }
    return tiles;
}

const neutral = '--surface-tertiary';
const fragments = fragmentFiles()
    .map((file: string) => extractFragment(visualsSkillFiles[`references/fragments/${file}`], file))
    .filter((fragment: { html: string } | null) => fragment !== null);

test('every tile in a fragment follows the tile grammar', () => {
    const shapesSeen = new Set<string>();
    let checked = 0;
    for (const fragment of fragments) {
        const tiles = tilesIn(fragment.html);
        expect(tiles.length, `${fragment.slug} tiles in a row`).toBeLessThanOrEqual(4);
        const isStatusTile = (tile: Tile) =>
            tile.title === 'Today' &&
            tile.value === '—' &&
            tile.chips[0]?.text === 'Not synced yet';
        const periodTitles = tiles.filter((tile) => !isStatusTile(tile));
        const withPeriod = periodTitles.filter((tile) => tile.title.includes(' · ')).length;
        // Periods name themselves on every tile or on none.
        expect([0, periodTitles.length], `${fragment.slug} period titles`).toContain(withPeriod);
        for (const tile of tiles) {
            const label = `${fragment.slug}: ${tile.title}`;
            checked += 1;
            expect(tile.title, label).not.toMatch(/[,()]/u);
            expect(tile.title, label).not.toMatch(/\bSept\b/u);
            const [metric, suffix, extra] = tile.title.split(' · ');
            expect(extra, label).toBeUndefined();
            if (suffix !== undefined) {
                expect(suffix, label).toMatch(period);
            }
            if (!isStatusTile(tile)) {
                expect(metric, `${label} is a metric, not a period`).not.toMatch(period);
                expect(metric?.toLowerCase(), label).not.toMatch(period);
            }
            const valueRule = tile.title.includes('per unit') ? perUnitValue : value;
            expect(tile.value, `${label} value`).toMatch(valueRule);
            expect(tile.chips.length, `${label} chips`).toBeLessThanOrEqual(1);
            for (const chip of tile.chips) {
                const shape = Object.entries(chipShapes).find(([, rule]) => rule.test(chip.text));
                expect(shape?.[0], `${label} chip "${chip.text}"`).toBeDefined();
                const name = shape?.[0] ?? '';
                shapesSeen.add(name);
                const colors: Record<string, string[]> = {
                    change: chip.text.startsWith('flat')
                        ? [neutral]
                        : ['--success-bg', '--error-bg'],
                    ratio: [neutral],
                    status: ['--warning-bg'],
                };
                expect(colors[name], `${label} chip color`).toContain(chip.background);
            }
        }
    }
    expect(checked).toBeGreaterThanOrEqual(9);
    expect([...shapesSeen].sort()).toEqual(['change', 'ratio', 'status']);
});

const flowText = (text: string) => text.replace(/\s+/gu, ' ');
const quoted = (items: string[]) => items.map((item) => `\`${item}\``).join(', ');

test('components.md states the tile grammar the lint enforces', () => {
    const components = flowText(visualsSkillFiles['references/components.md'] ?? '');

    expect(components).toContain(
        'every title names its period as `Metric · period`, and the middle dot is the only separator.'
    );
    expect(components).toContain(
        'Periods come from one list: `today`, `yesterday`, `7d`, `30d`, `MTD`, a date `Sep 14`, a range `Sep 1–14` (en dash, no spaces).'
    );
    expect(components).toContain(`The comparator is one of ${quoted(comparators)}.`);
    expect(components).toContain(
        'compact from 10,000 with at most one decimal and no trailing zero'
    );
    // Tiles went compact from 1,000 while axes waited for 10,000; one threshold
    // now serves both, so the old tile rule must not survive anywhere.
    const everySource = [
        defaultVisualsSkill,
        ...skillModules.map((name: string) => visualsSkillFiles[`references/${name}`] ?? ''),
        ...fragmentFiles().map(
            (file: string) => visualsSkillFiles[`references/fragments/${file}`] ?? ''
        ),
    ];
    for (const source of everySource) {
        expect(flowText(source)).not.toContain('compact above a thousand');
        expect(source).not.toContain('12.9K');
    }
});

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    defaultVisualsSkill,
    seedFactoryManagedSkills,
    visualsSkillFiles,
} from './managed-skills.ts';

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

/**
 * The taught vocabulary is a published contract: `agent-html/tokens.ts` emits
 * these names into every frame, and the skill is the only place an agent
 * learns them. A name that drifts out of one side and not the other is
 * invisible until a visual renders unstyled.
 */
const taughtTokens = [
    '--font-sans',
    '--font-mono',
    '--app-ui-font-size',
    '--background',
    '--surface',
    '--surface-secondary',
    '--surface-tertiary',
    '--foreground',
    '--muted-foreground',
    '--foreground-tertiary',
    '--border',
    '--border-strong',
    '--accent',
    '--accent-foreground',
    '--accent-bg',
    '--success',
    '--success-foreground',
    '--success-bg',
    '--warning',
    '--warning-foreground',
    '--warning-bg',
    '--error',
    '--error-foreground',
    '--error-bg',
    '--chart-1',
    '--chart-5',
    '--chart-grid',
    '--chart-label',
    '--radius',
    '--radius-card',
    '--pad-sm',
    '--pad-md',
    '--pad-lg',
    '--gap-xs',
    '--gap-sm',
    '--gap-md',
    '--gap-lg',
];

/**
 * Retired names are no longer published at all, so teaching one would have
 * agents writing a vocabulary the frame does not emit.
 */
const retiredTokens = [
    '--brand',
    '--info',
    '--primary',
    '--secondary',
    '--card',
    '--popover',
    '--subtle',
    '--destructive',
    '--input',
    '--ring',
    '--foreground-quaternary',
    '--font-heading',
    '--app-code-font-size',
    '--t-micro',
    '--t-fast',
    '--t-normal',
    '--t-slow',
    '--ease-out',
    '--ease-in',
    '--ease-standard',
    '--radius-sm',
    '--radius-md',
    '--radius-lg',
    '--radius-xl',
    '--radius-2xl',
    '--label-blue-fg',
    '--label-gray-fg',
    '--surface-shadow',
    '--overlay-shadow',
    '--ease-in-out-quad',
    '--surface-2',
    '--surface-3',
    '--surface-4',
];

test('visuals design system teaches the app type scale', () => {
    const designSystem = visualsSkillFiles['references/design-system.md'] ?? '';

    expect(designSystem).toContain('The base body size is **14px**');
    expect(designSystem).toContain('Body text: 14px, line-height 1.5.');
    expect(designSystem).toContain('Title / section labels: 15–16px');
    expect(designSystem).toContain('Secondary text, dense table cells, and code: 12–13px.');
    expect(designSystem).toContain(
        'Metadata and compact labels: 11–12px. No font-size below 11px.'
    );
    expect(designSystem).not.toContain('16px, line-height 1.5');
});

test('visuals design system teaches every published token name', () => {
    const designSystem = visualsSkillFiles['references/design-system.md'] ?? '';

    for (const token of taughtTokens) {
        expect(designSystem).toContain(token);
    }
});

test('no visuals skill file teaches a retired token name', () => {
    const taught = [
        defaultVisualsSkill,
        visualsSkillFiles['references/design-system.md'] ?? '',
        visualsSkillFiles['references/icons.md'] ?? '',
    ];

    for (const source of taught) {
        for (const retired of retiredTokens) {
            expect(source).not.toContain(retired);
        }
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

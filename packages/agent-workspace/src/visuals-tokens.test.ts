import { expect, test } from 'bun:test';
import { agentHtmlTokenNames } from '../../../apps/website/src/agent-html/tokens.ts';
import {
    fragmentFiles,
    skillModules,
} from '../../../scripts/visuals-lab/engine/skill-fragments.mjs';
import { defaultVisualsSkill, visualsSkillFiles } from './managed-skills.ts';

const moduleSource = (name: string) => visualsSkillFiles[`references/${name}`] ?? '';
const everySkillSource = () => [
    defaultVisualsSkill,
    ...skillModules.map(moduleSource),
    ...fragmentFiles().map((file: string) => moduleSource(`fragments/${file}`)),
];

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

/**
 * The taught list above is the core's contract; this one is the frame's. Every
 * name `agent-html/tokens.ts` emits has to be taught somewhere in the skill,
 * or agents never learn a name the frame is paying to publish.
 */
test('the skill teaches every name the frame publishes', () => {
    const everything = everySkillSource().join('\n');

    for (const token of [...agentHtmlTokenNames, '--chart-grid', '--chart-label']) {
        expect(everything).toContain(token);
    }
});

test('no visuals skill file teaches a retired token name', () => {
    for (const source of everySkillSource()) {
        for (const retired of retiredTokens) {
            expect(source).not.toContain(retired);
        }
    }
});

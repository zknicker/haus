import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guarded contract for workspace tab sizing.
 *
 * A browser tab is a size container so it can drop its title below 72px. Size
 * containment zeroes the tab's intrinsic width, and the tab list sizes to its
 * tabs' intrinsic widths, so a container tab without an explicit intrinsic
 * width collapsed every tab to favicon-only even with most of the strip free.
 * jsdom cannot lay this out, so this pins the rule that restores the width.
 */

const themeCss = readFileSync(join(import.meta.dir, 'default-theme.css'), 'utf8').replace(
    /\s+/gu,
    ' '
);

/** The rule whose selector list is exactly `selector`. */
function ruleBody(selector: string): string {
    const start = themeCss.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return themeCss.slice(start, themeCss.indexOf('}', start));
}

/** The selector list and body of the rule whose selector list starts with `prefix`. */
function ruleStartingWith(prefix: string): string {
    const start = themeCss.indexOf(prefix);
    expect(start).toBeGreaterThan(-1);
    return themeCss.slice(start, themeCss.indexOf('}', start));
}

describe('workspace tab sizing contract', () => {
    test('every tab kind shares one 200px width basis', () => {
        expect(ruleBody('.workspace-titlebar')).toContain('--workspace-tab-width: 12.5rem;');
    });

    test('every tab kind restates its basis as its intrinsic width and shrinks from it', () => {
        // The sizing rule, not the base `.workspace-tab` anatomy rule above it.
        const tab = ruleStartingWith('.workspace-tab { container-type: inline-size;');
        expect(tab).toContain('flex: 0 1 var(--workspace-tab-width);');
        expect(tab).toContain('contain-intrinsic-inline-size: var(--workspace-tab-width);');
        expect(tab).not.toContain('max-width');
    });

    test('the chat tab shrinks with the rest instead of holding a fixed width', () => {
        expect(themeCss).not.toContain('.workspace-primary-tab {');
        expect(themeCss).not.toContain('data-kind="primary"');
    });

    test('every tab kind sorts in one list', () => {
        expect(themeCss).not.toContain('.workspace-browser-tab-list');
        expect(ruleBody('.workspace-tab-list')).toContain('overflow: hidden;');
    });

    test('the selected tab wears the segment material and hover the ghost fill', () => {
        const selected = ruleBody('.workspace-tab[data-active="true"]');
        expect(selected).toContain('background: var(--segment);');
        expect(selected).toContain('box-shadow: var(--surface-shadow);');
        expect(ruleBody('.workspace-tab:not([data-active="true"]):hover')).toContain(
            'background: var(--default);'
        );
    });

    test('the tab list shrinks to fit rather than overflowing the strip', () => {
        const list = ruleBody('.workspace-tab-list');
        expect(list).toContain('min-width: 0;');
        expect(list).toMatch(/flex: 0 1 auto;/u);
    });

    test('tabs are the sm control height plus 2px, with a 20px mark slot', () => {
        expect(ruleBody('.workspace-titlebar')).toContain(
            '--workspace-tab-height: calc(var(--spacing) * 8 + 2px);'
        );
        const mark = ruleBody('.workspace-tab__mark');
        expect(mark).toContain('width: 1.25rem;');
        expect(mark).toContain('height: 1.25rem;');
    });

    test('a divider sits centered in the gap before each tab and the new-tab button', () => {
        const divider = ruleBody('.workspace-tab::before, .workspace-new-tab::before');
        expect(divider).toContain('background: var(--separator);');
        expect(divider).toContain('width: 1px;');
        const gap = /gap: (calc\(var\(--spacing\) \* [\d.]+\));/u.exec(
            ruleBody('.workspace-tab-list')
        )?.[1];
        expect(gap).toBeDefined();
        const inner = gap?.slice('calc('.length, -1);
        expect(divider).toContain(`inset-inline-start: calc(${inner} / -2 - 0.5px);`);
        expect(ruleBody('.workspace-tab')).toContain('position: relative;');
        expect(ruleBody('.workspace-tab')).not.toContain('overflow');
    });

    test('dividers hide beside a selected, hovered, or dragged tab', () => {
        const filled = '.workspace-tab:is([data-active="true"], [data-dragging="true"])';
        const hidden = ruleStartingWith(`.workspace-tab:first-child::before, ${filled}::before,`);
        expect(hidden).toContain('opacity: 0;');
        expect(themeCss).toContain(`${filled} + .workspace-tab::before,`);
        expect(themeCss).toContain(
            '.workspace-tabs:has(.workspace-tab:last-child:is([data-active="true"], [data-dragging="true"])) .workspace-new-tab::before {'
        );
        const hover = ruleStartingWith('.workspace-tab:hover::before,');
        expect(hover).toContain('.workspace-new-tab:hover::before');
        expect(hover).toContain('opacity: 0;');
    });

    test('a cut-off title ends in an ellipsis', () => {
        expect(ruleBody('.workspace-tab__label')).toContain('text-overflow: ellipsis;');
    });
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guarded contract for text selection (.design/guidelines.md → "Text selection").
 *
 * The App reads like a native Mac app: chrome never selects, content does.
 * That is one policy in `global.css` — a `none` default on the body and one
 * opt-in list — not a scatter of call-site `select-*` classes. This pins the
 * default and the opt-ins every content kind relies on, because losing either
 * half is silent: chrome turns highlightable on click-drag and Shift-click, or
 * message text stops copying.
 */

const globalCss = readFileSync(join(import.meta.dir, 'global.css'), 'utf8');

/** Leaf rules as selector lists and declaration blocks, comments stripped. */
const rules = [
    ...globalCss.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]+)\{([^{}]*)\}/gu),
].map(([, selectors = '', declarations = '']) => ({
    declarations,
    selectors: selectors.split(',').map((selector) => selector.trim()),
}));

function declarationsFor(selector: string): string {
    return rules
        .filter((rule) => rule.selectors.includes(selector))
        .map((rule) => rule.declarations)
        .join('\n');
}

describe('text selection contract', () => {
    test('the body defaults to unselectable chrome', () => {
        const body = declarationsFor('body');
        expect(body).toContain('-webkit-user-select: none');
        expect(body).toMatch(/(?<!-)user-select: none/u);
    });

    test('fields, editors, code, and marked content regions opt back in', () => {
        for (const selector of [
            'input',
            'textarea',
            'pre',
            'code',
            "[contenteditable]:not([contenteditable='false'])",
            '[data-selectable-text]',
        ]) {
            const declarations = declarationsFor(selector);
            expect(declarations).toContain('-webkit-user-select: text');
            expect(declarations).toMatch(/(?<!-)user-select: text/u);
        }
    });
});

import { describe, expect, test } from 'bun:test';
import { agentHtmlTokenCss, injectHostTokenStyle } from '../agent-html/tokens.ts';

describe('host token injection', () => {
    test('inserts the token block after the opening head tag', () => {
        const html = '<!doctype html><html><head><title>x</title></head><body></body></html>';
        const out = injectHostTokenStyle(html, ':root{--background:#111;}');

        expect(out).toContain(
            '<head><style data-haus-tokens>:root{--background:#111;}</style><title>'
        );
    });

    test('prepends when the document has no head', () => {
        const out = injectHostTokenStyle('<p>hi</p>', ':root{--x:1;}');

        expect(out.startsWith('<style data-haus-tokens>:root{--x:1;}</style><p>hi</p>')).toBe(true);
    });

    test('leaves the document untouched without token css', () => {
        expect(injectHostTokenStyle('<p>hi</p>', '')).toBe('<p>hi</p>');
    });

    test('reads nothing outside a browser document', () => {
        expect(agentHtmlTokenCss('dark')).toBe('');
    });
});

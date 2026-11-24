import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { getOpenLinksIn, readOpenLinksIn } from '../../../hooks/browser/open-links-preference.ts';
import { applyOpenLinksInBrowser, OpenLinksInRow } from './links-section.tsx';

describe('open links in your browser', () => {
    test('renders a switch that is on only when links open in the browser', () => {
        const off = renderToStaticMarkup(<OpenLinksInRow value="haus" />);
        const on = renderToStaticMarkup(<OpenLinksInRow value="browser" />);
        expect(off).toContain('Open links in your browser');
        expect(off).toContain('role="switch"');
        expect(off).not.toContain('checked=""');
        expect(on).toContain('checked=""');
    });

    test('the switch writes the browser or Haus', () => {
        applyOpenLinksInBrowser(true);
        expect(getOpenLinksIn()).toBe('browser');
        applyOpenLinksInBrowser(false);
        expect(getOpenLinksIn()).toBe('haus');
    });

    test('nothing stored and anything unrecognized both mean Haus', () => {
        expect(readOpenLinksIn({ getItem: () => null })).toBe('haus');
        expect(readOpenLinksIn({ getItem: () => 'chrome' })).toBe('haus');
        expect(readOpenLinksIn({ getItem: () => 'browser' })).toBe('browser');
    });
});

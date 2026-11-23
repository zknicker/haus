import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { getOpenLinksIn, readOpenLinksIn } from '../../../hooks/browser/open-links-preference.ts';
import { applyOpenLinksIn, OpenLinksInRow } from './links-section.tsx';

describe('open links in', () => {
    test('renders the choice', () => {
        const markup = renderToStaticMarkup(<OpenLinksInRow value="haus" />);
        expect(markup).toContain('Open links in');
    });

    test('a pick writes the choice, and anything else is ignored', () => {
        applyOpenLinksIn('browser');
        expect(getOpenLinksIn()).toBe('browser');
        applyOpenLinksIn('safari');
        expect(getOpenLinksIn()).toBe('browser');
        applyOpenLinksIn('haus');
        expect(getOpenLinksIn()).toBe('haus');
    });

    test('nothing stored and anything unrecognized both mean Haus', () => {
        expect(readOpenLinksIn({ getItem: () => null })).toBe('haus');
        expect(readOpenLinksIn({ getItem: () => 'chrome' })).toBe('haus');
        expect(readOpenLinksIn({ getItem: () => 'browser' })).toBe('browser');
    });
});

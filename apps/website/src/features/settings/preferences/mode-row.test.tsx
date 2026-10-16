import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModeField } from './mode-row.tsx';

const noop = () => undefined;

describe('mode setting', () => {
    test('shows the stored preference and is enabled when nothing pins the mode', () => {
        const markup = renderToStaticMarkup(
            <ModeField forcedTheme={null} onChange={noop} theme="light" />
        );
        expect(shownValue(markup)).toBe('Light');
        expect(markup).not.toContain('data-disabled');
    });

    test('a pinned mode shows that mode, disabled, over the stored preference', () => {
        const markup = renderToStaticMarkup(
            <ModeField forcedTheme="dark" onChange={noop} theme="light" />
        );
        expect(shownValue(markup)).toBe('Dark');
        expect(markup).toContain('data-disabled="true"');
    });
});

function shownValue(markup: string) {
    return markup.match(/data-slot="select-value"[^>]*><span[^>]*>([^<]+)</)?.[1];
}

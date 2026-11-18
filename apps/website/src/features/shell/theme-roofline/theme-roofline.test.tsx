import { afterEach, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { selectColorTheme } from '../../../hooks/shell/use-color-theme.ts';
import { WindowBand } from '../window-band.tsx';
import { ThemeRoofline } from './theme-roofline.tsx';

afterEach(() => {
    selectColorTheme('default', null);
});

test('the roofline mounts nothing under a theme without it', () => {
    for (const theme of ['default', 'halloween'] as const) {
        selectColorTheme(theme, null);

        expect(renderToStaticMarkup(<ThemeRoofline placement="band" />)).toBe('');
        expect(renderToStaticMarkup(<ThemeRoofline placement="sidebar" />)).toBe('');
        expect(renderToStaticMarkup(<WindowBand />)).not.toContain('theme-roofline');
    }
});

test('the roofline mounts as hidden, inert art under both Christmas themes', () => {
    for (const theme of ['christmas-eve', 'christmas-morning'] as const) {
        selectColorTheme(theme, null);

        // Back to front: flurries, then the bulbs, then the snow they hang from.
        expect(renderToStaticMarkup(<ThemeRoofline placement="sidebar" />)).toBe(
            '<div aria-hidden="true" class="theme-roofline theme-roofline--sidebar">' +
                '<canvas class="theme-roofline__flurries"></canvas>' +
                '<canvas class="theme-roofline__bulbs"></canvas>' +
                '<canvas class="theme-roofline__snow"></canvas></div>'
        );
        // On desktop it spans the whole band, ahead of the lead and the tab
        // rows, and replaces Halloween's sky rather than joining it.
        const band = renderToStaticMarkup(<WindowBand />);
        expect(band).toMatch(
            /^<div class="shell-window-band" data-window-drag-region=""><div aria-hidden="true" class="theme-roofline theme-roofline--band">/u
        );
        expect(band).not.toContain('halloween-sky');
    }
});

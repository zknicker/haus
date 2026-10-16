import { afterEach, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { selectColorTheme } from '../../hooks/shell/use-color-theme.ts';
import { HalloweenSky } from './halloween-sky.tsx';
import { WindowBand } from './window-band.tsx';

afterEach(() => {
    selectColorTheme('default', null);
});

test('the sky mounts nothing under the default theme', () => {
    selectColorTheme('default', null);

    expect(renderToStaticMarkup(<HalloweenSky placement="band" />)).toBe('');
    expect(renderToStaticMarkup(<HalloweenSky placement="sidebar" />)).toBe('');
    expect(renderToStaticMarkup(<WindowBand />)).not.toContain('halloween-sky');
});

test('the sky mounts as hidden, inert art under Halloween', () => {
    selectColorTheme('halloween', null);

    expect(renderToStaticMarkup(<HalloweenSky placement="sidebar" />)).toBe(
        '<canvas aria-hidden="true" class="halloween-sky halloween-sky--sidebar"></canvas>'
    );
    // On desktop it sits inside the band's sidebar-width lead, behind its controls.
    expect(renderToStaticMarkup(<WindowBand />)).toMatch(
        /<div class="shell-window-band__lead app-shell-band"[^>]*><canvas aria-hidden="true" class="halloween-sky halloween-sky--band"><\/canvas><\/div>/u
    );
});

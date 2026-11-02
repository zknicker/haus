import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { selectColorTheme } from '../../../hooks/shell/use-color-theme.ts';
import { getRooflineSnow, selectRooflineSnow } from '../../../hooks/shell/use-roofline-snow.ts';
import { colorThemes } from '../../../lib/color-themes.ts';
import { applyRooflineSnow, SnowField, SnowRow } from './snow-row.tsx';

describe('snow setting', () => {
    afterEach(() => {
        selectColorTheme('default', null);
        selectRooflineSnow('puffy', null);
    });

    test('shows only while the theme’s scene is the snowy roofline', () => {
        const shownFor = colorThemes
            .filter((theme) => {
                selectColorTheme(theme.id, null);
                return renderToStaticMarkup(<SnowRow />).includes('Snow');
            })
            .map((theme) => theme.id);

        expect(shownFor).toEqual(
            colorThemes.filter((theme) => theme.scene === 'snowy-roofline').map((theme) => theme.id)
        );
        expect(shownFor.length).toBeGreaterThan(0);
    });

    test('is nothing without a roofline, and shows the live snow with one', () => {
        expect(renderToStaticMarkup(<SnowField snow={null} />)).toBe('');
        expect(shownValue(renderToStaticMarkup(<SnowField snow="soft" />))).toBe('Soft');

        selectColorTheme('christmas-eve', null);
        selectRooflineSnow('icicles', null);
        expect(shownValue(renderToStaticMarkup(<SnowRow />))).toBe('Icicles');
    });

    test('a pick applies the snow, and anything else is ignored', () => {
        applyRooflineSnow('icicles');
        expect(getRooflineSnow()).toBe('icicles');
        applyRooflineSnow('blizzard');
        expect(getRooflineSnow()).toBe('icicles');
        applyRooflineSnow('soft');
        expect(getRooflineSnow()).toBe('soft');
    });
});

function shownValue(markup: string) {
    return markup.match(/data-slot="select-value"[^>]*><span[^>]*>([^<]+)</)?.[1];
}

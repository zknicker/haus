import { describe, expect, test } from 'bun:test';
import { ghostTile, homeBackgroundLayers, homeInputOpacity } from './home-background-style.ts';
import { defaultBackgroundAdjustments, noBackground, themeBackground } from './home-background.ts';

const photo = { id: 'abc123', name: 'lake.gif', type: 'image/gif' } as const;
const defaultStyle = {
    '--home-background-art': 'none',
    '--home-background-blur': '0px',
    '--home-background-brightness': '1',
    '--home-background-fade': '0%',
    '--home-background-image-opacity': '1',
    '--home-background-overlay': '0',
};

describe('home background style', () => {
    test('no source draws nothing', () => {
        expect(homeBackgroundLayers(noBackground, null)).toBeNull();
    });

    test('a pattern draws from the tokens with default adjustments', () => {
        expect(homeBackgroundLayers(themeBackground('dots'), null)).toEqual({
            art: 'dots',
            effect: 'none',
            style: defaultStyle,
        });
    });

    test('the ghost pattern masks with the ghost silhouette tile', () => {
        const layers = homeBackgroundLayers(themeBackground('ghosts'), null);
        expect(layers?.style['--home-background-art']).toBe(ghostTile);
        expect(ghostTile.startsWith('url("data:image/svg+xml,%3Csvg')).toBe(true);
        expect(ghostTile).toContain('fill-rule%3D%22evenodd%22');
    });

    test('an upload draws only once its URL is ready', () => {
        const background = { ...themeBackground('image'), image: photo };
        expect(homeBackgroundLayers(background, null)).toBeNull();
        expect(
            homeBackgroundLayers(background, 'blob:haus/1')?.style['--home-background-art']
        ).toBe('url("blob:haus/1")');
    });

    test('effect and adjustments at their extremes', () => {
        const background = {
            ...themeBackground('image'),
            adjustments: {
                blur: 100,
                bottomFade: 100,
                brightness: 150,
                imageOpacity: 0,
                inputOpacity: 20,
                overlayOpacity: 100,
            },
            effect: 'dither',
            image: photo,
        } as const;
        expect(homeBackgroundLayers(background, 'blob:haus/1')).toEqual({
            art: 'image',
            effect: 'dither',
            style: {
                '--home-background-art': 'url("blob:haus/1")',
                '--home-background-blur': '32px',
                '--home-background-brightness': '1.5',
                '--home-background-fade': '100%',
                '--home-background-image-opacity': '0',
                '--home-background-overlay': '1',
            },
        });
        expect(homeInputOpacity(background)).toBe('0.2');
    });

    test('blur scales to pixels and input opacity defaults to 0.9', () => {
        const background = {
            ...themeBackground('aurora'),
            adjustments: { ...defaultBackgroundAdjustments, blur: 33 },
            effect: 'grain',
        } as const;
        expect(homeBackgroundLayers(background, null)?.style['--home-background-blur']).toBe(
            '10.6px'
        );
        expect(homeBackgroundLayers(background, null)?.effect).toBe('grain');
        expect(homeInputOpacity(themeBackground('aurora'))).toBe('0.9');
    });
});

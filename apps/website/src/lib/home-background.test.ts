import { describe, expect, test } from 'bun:test';
import {
    backgroundArt,
    backgroundImageProblem,
    clampAdjustment,
    defaultBackgroundAdjustments,
    noBackground,
    parseThemeBackground,
    themeBackground,
    withAdjustment,
    withDefaultAdjustments,
} from './home-background.ts';
import {
    parsePresetBackgrounds,
    presetBackground,
    presetBackgroundsStorageKey,
    readStoredPresetBackgrounds,
    writeStoredPresetBackgrounds,
} from './preset-backgrounds.ts';

const photo = { id: 'abc123', name: 'lake.jpg', type: 'image/jpeg' } as const;

describe('home backgrounds', () => {
    test('defaults are no art, no effect, and the adjustment defaults', () => {
        expect(noBackground).toEqual({
            adjustments: {
                blur: 0,
                bottomFade: 0,
                brightness: 100,
                imageOpacity: 100,
                inputOpacity: 90,
                overlayOpacity: 0,
            },
            effect: 'none',
            image: null,
            source: 'none',
        });
    });

    test('round-trips through parsing unchanged', () => {
        const background = {
            adjustments: { ...defaultBackgroundAdjustments, blur: 25, overlayOpacity: 40 },
            effect: 'vignette',
            image: photo,
            source: 'image',
        } as const;
        expect(parseThemeBackground(JSON.parse(JSON.stringify(background)))).toEqual(background);
    });

    test('parsing clamps adjustments and falls back field by field', () => {
        expect(
            parseThemeBackground({
                adjustments: { blur: 400, brightness: 10, imageOpacity: 'x', inputOpacity: 0 },
                effect: 'sparkle',
                image: { id: 'BAD ID', name: 'x', type: 'image/png' },
                source: 'image',
            })
        ).toEqual({
            adjustments: {
                blur: 100,
                bottomFade: 0,
                brightness: 50,
                imageOpacity: 100,
                inputOpacity: 20,
                overlayOpacity: 0,
            },
            effect: 'none',
            image: null,
            source: 'none',
        });
        expect(parseThemeBackground('dots')).toBeNull();
        expect(parseThemeBackground({ source: 'plaid' })).toEqual(noBackground);
    });

    test('clamping rounds into range and drops non-numbers to the default', () => {
        expect(clampAdjustment('brightness', 151.6)).toBe(150);
        expect(clampAdjustment('inputOpacity', 3)).toBe(20);
        expect(clampAdjustment('blur', 12.4)).toBe(12);
        expect(clampAdjustment('blur', Number.NaN)).toBe(0);
        expect(withAdjustment(noBackground, 'overlayOpacity', 140).adjustments.overlayOpacity).toBe(
            100
        );
    });

    test('reset keeps the source and image but restores effect and adjustments', () => {
        const tuned = {
            ...withAdjustment(themeBackground('image'), 'blur', 60),
            effect: 'grain',
            image: photo,
        } as const;
        expect(withDefaultAdjustments(tuned)).toEqual({
            adjustments: defaultBackgroundAdjustments,
            effect: 'none',
            image: photo,
            source: 'image',
        });
    });

    test('art follows the source, and an upload is kept while a pattern is picked', () => {
        expect(backgroundArt(themeBackground('ghosts'))).toEqual({
            kind: 'pattern',
            pattern: 'ghosts',
        });
        expect(backgroundArt({ ...themeBackground('image'), image: photo })).toEqual({
            image: photo,
            kind: 'image',
        });
        expect(backgroundArt({ ...themeBackground('dots'), image: photo })).toEqual({
            kind: 'pattern',
            pattern: 'dots',
        });
        expect(backgroundArt(themeBackground('image'))).toEqual({ kind: 'none' });
    });

    test('uploads must be an image type and at most 8 MB', () => {
        expect(backgroundImageProblem({ size: 1024, type: 'image/gif' })).toBeNull();
        expect(backgroundImageProblem({ size: 8 * 1024 * 1024, type: 'image/png' })).toBeNull();
        expect(backgroundImageProblem({ size: 12.4 * 1024 * 1024, type: 'image/png' })).toBe(
            'That image is 12.4 MB. Choose one up to 8 MB.'
        );
        expect(backgroundImageProblem({ size: 10, type: 'image/svg+xml' })).toBe(
            'Choose a PNG, JPEG, GIF, WebP or AVIF image.'
        );
    });
});

describe('preset backgrounds', () => {
    test('a preset shows its default until this device overrides it', () => {
        expect(presetBackground('default', {}).source).toBe('none');
        expect(presetBackground('halloween', {}).source).toBe('ghosts');
        const override = themeBackground('dots');
        expect(presetBackground('halloween', { halloween: override })).toBe(override);
    });

    test('storage keeps valid overrides for real presets only', () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
                values.set(key, value);
            },
        };
        writeStoredPresetBackgrounds(storage, { nord: themeBackground('aurora') });
        expect(readStoredPresetBackgrounds(storage)).toEqual({ nord: themeBackground('aurora') });
        expect(
            parsePresetBackgrounds({ 'custom-abc': themeBackground('dots'), nord: 'x', one: {} })
        ).toEqual({ one: noBackground });
        values.set(presetBackgroundsStorageKey, '{');
        expect(readStoredPresetBackgrounds(storage)).toEqual({});
        expect(readStoredPresetBackgrounds(null)).toEqual({});
    });
});

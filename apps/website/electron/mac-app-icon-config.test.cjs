'use strict';

const { describe, expect, test } = require('bun:test');
const { macAppIconConfiguration, themeDockIconResources } = require('./mac-app-icon-config.cjs');

describe('macOS app icon packaging', () => {
    test('names the asset-catalog icon when the catalog is packaged', () => {
        const configuration = macAppIconConfiguration(true);

        expect(configuration.extendInfo.CFBundleIconName).toBe('AppIcon');
        expect(configuration.extraResources).toEqual([
            {
                from: 'electron/generated-icons/Assets.car',
                to: 'Assets.car',
            },
            ...themeDockIconResources,
        ]);
    });

    test('lets macOS use the packaged ICNS when no asset catalog exists', () => {
        const configuration = macAppIconConfiguration(false);

        expect(configuration.extendInfo.CFBundleIconName).toBeUndefined();
        expect(configuration.extraResources).toEqual(themeDockIconResources);
    });

    test('packages every theme Dock icon where the packaged App reads it', () => {
        expect(themeDockIconResources).toEqual([
            { from: 'electron/icons/AppIcon-pumpkin.png', to: 'app-icons/AppIcon-pumpkin.png' },
            { from: 'electron/icons/AppIcon-santa.png', to: 'app-icons/AppIcon-santa.png' },
        ]);
    });
});

'use strict';

const path = require('node:path');
const { describe, expect, test } = require('bun:test');
const { packagedIconsDirectory, pumpkinIconFile } = require('./dock-app-icon.cjs');
const { macAppIconConfiguration, pumpkinDockIconResource } = require('./mac-app-icon-config.cjs');

describe('macOS app icon packaging', () => {
    test('names the asset-catalog icon when the catalog is packaged', () => {
        const configuration = macAppIconConfiguration(true);

        expect(configuration.extendInfo.CFBundleIconName).toBe('AppIcon');
        expect(configuration.extraResources).toEqual([
            {
                from: 'electron/generated-icons/Assets.car',
                to: 'Assets.car',
            },
            pumpkinDockIconResource,
        ]);
    });

    test('lets macOS use the packaged ICNS when no asset catalog exists', () => {
        const configuration = macAppIconConfiguration(false);

        expect(configuration.extendInfo.CFBundleIconName).toBeUndefined();
        expect(configuration.extraResources).toEqual([pumpkinDockIconResource]);
    });

    test('packages the pumpkin Dock icon where the packaged App reads it', () => {
        expect(pumpkinDockIconResource).toEqual({
            from: `electron/icons/${pumpkinIconFile}`,
            to: path.posix.join(packagedIconsDirectory, pumpkinIconFile),
        });
    });
});

'use strict';

const path = require('node:path');
const { packagedIconsDirectory, themeIconFiles } = require('./dock-app-icon.cjs');

const assetCatalogPath = 'electron/generated-icons/Assets.car';
// The live Dock icons for the seasonal themes; `dock-app-icon.cjs` reads them from Resources.
const themeDockIconResources = Object.values(themeIconFiles).map((file) => ({
    from: `electron/icons/${file}`,
    to: path.posix.join(packagedIconsDirectory, file),
}));

function macAppIconConfiguration(hasAssetCatalog) {
    return {
        extendInfo: {
            ...(hasAssetCatalog ? { CFBundleIconName: 'AppIcon' } : {}),
            LSMultipleInstancesProhibited: true,
        },
        extraResources: [
            ...(hasAssetCatalog ? [{ from: assetCatalogPath, to: 'Assets.car' }] : []),
            ...themeDockIconResources,
        ],
    };
}

module.exports = { assetCatalogPath, macAppIconConfiguration, themeDockIconResources };

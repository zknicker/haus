'use strict';

const assetCatalogPath = 'electron/generated-icons/Assets.car';
// The live Dock icon for the Halloween theme; `dock-app-icon.cjs` reads it from Resources.
const pumpkinDockIconResource = {
    from: 'electron/icons/AppIcon-pumpkin.png',
    to: 'app-icons/AppIcon-pumpkin.png',
};

function macAppIconConfiguration(hasAssetCatalog) {
    return {
        extendInfo: {
            ...(hasAssetCatalog ? { CFBundleIconName: 'AppIcon' } : {}),
            LSMultipleInstancesProhibited: true,
        },
        extraResources: [
            ...(hasAssetCatalog ? [{ from: assetCatalogPath, to: 'Assets.car' }] : []),
            pumpkinDockIconResource,
        ],
    };
}

module.exports = { assetCatalogPath, macAppIconConfiguration, pumpkinDockIconResource };

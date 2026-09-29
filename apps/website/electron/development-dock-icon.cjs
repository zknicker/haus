'use strict';

const { existsSync } = require('node:fs');
const path = require('node:path');

function installDevelopmentDockIcon(app) {
    if (process.platform !== 'darwin' || app.isPackaged || !app.dock) {
        return;
    }
    const iconPath = path.join(__dirname, 'icons', 'AppIcon.png');
    if (existsSync(iconPath)) {
        app.dock.setIcon(iconPath);
    }
}

module.exports = { installDevelopmentDockIcon };

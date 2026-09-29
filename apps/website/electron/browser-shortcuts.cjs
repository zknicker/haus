'use strict';

function browserShortcut(input) {
    if (input.type !== 'keyDown' || input.alt) {
        return null;
    }
    const key = input.key.toLowerCase();
    if (input.control && key === 'tab') {
        return input.shift ? 'previous-tab' : 'next-tab';
    }
    if (!(input.meta || input.control)) {
        return null;
    }
    if (key === 'l') {
        return 'address';
    }
    if (key === 'r') {
        return 'reload';
    }
    if (/^[1-9]$/.test(key)) {
        return `tab-${key}`;
    }
    if (input.shift && key === '[') {
        return 'previous-tab';
    }
    if (input.shift && key === ']') {
        return 'next-tab';
    }
    return null;
}

function installBrowserShortcuts(contents, window) {
    contents.on('before-input-event', (event, input) => {
        const shortcut = browserShortcut(input);
        if (!shortcut) {
            return;
        }
        event.preventDefault();
        window.webContents.focus();
        window.webContents.send('desktop:browser:shortcut', shortcut);
    });
}

module.exports = { browserShortcut, installBrowserShortcuts };

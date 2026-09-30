'use strict';

// JPEG keeps a Retina capture fast to encode and small to cross IPC; the image is a transient backdrop.
const jpegQuality = 85;

/**
 * Captures a browser tab's painted page as an inline JPEG for the App to show while a DOM overlay
 * hides the native view. Returns null when there is nothing trustworthy to show: no web page, a
 * crashed or failed page, an empty frame, or a capture that finished after the tab stopped being
 * current or navigated away.
 */
async function captureBrowserPage(tab, isCurrent) {
    const contents = tab?.view.webContents;
    if (!contents || contents.isDestroyed() || contents.isCrashed() || tab.state.error) {
        return null;
    }
    const url = contents.getURL();
    if (!/^https?:/i.test(url)) {
        return null;
    }
    let image;
    try {
        image = await contents.capturePage();
    } catch {
        return null;
    }
    if (!isCurrent() || contents.isDestroyed() || contents.getURL() !== url || image.isEmpty()) {
        return null;
    }
    return `data:image/jpeg;base64,${image.toJPEG(jpegQuality).toString('base64')}`;
}

module.exports = { captureBrowserPage };

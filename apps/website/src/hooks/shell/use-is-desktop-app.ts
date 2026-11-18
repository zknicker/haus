import { useState } from 'react';
import { isElectronDesktopApp } from '../../lib/desktop-bridge.ts';

/**
 * Whether this surface is the Electron desktop App rather than a browser tab.
 * The answer is fixed for the life of the document, so it is read once instead
 * of subscribed to: the shell uses it to place native window chrome, such as
 * the titlebar band that hosts the macOS traffic lights.
 */
export function useIsDesktopApp() {
    const [isDesktopApp] = useState(isElectronDesktopApp);
    return isDesktopApp;
}

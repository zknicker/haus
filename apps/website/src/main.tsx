import { Toast } from '@heroui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.tsx';
import { DevModeProvider } from './components/dev-mode-provider.tsx';
import { ThemeProvider } from './components/theme-provider.tsx';
import { installStrayFileDropGuard } from './features/servers/chat/composer-file-drop.ts';
import { DesktopEditContextMenuProvider } from './features/shell/desktop-edit-context-menu.tsx';
import { HausClerkProvider } from './lib/clerk.tsx';
import { getDesktopBridge, isElectronDesktopApp } from './lib/desktop-bridge.ts';
import './styles/global.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Root element not found.');
}

installStrayFileDropGuard(window);

if (isElectronDesktopApp() && navigator.userAgent.includes('Mac')) {
    document.documentElement.classList.add('macos-electron');

    // Native windows dim their chrome when unfocused. Window focus comes from
    // the main process: renderer blur also fires when focus moves into an
    // iframe (artifact panes), which must not dim the window.
    getDesktopBridge()?.onWindowFocusChanged?.((focused) => {
        document.documentElement.classList.toggle('window-blurred', !focused);
    });
}

createRoot(rootElement).render(
    <StrictMode>
        <HausClerkProvider>
            <ThemeProvider>
                <DevModeProvider>
                    <DesktopEditContextMenuProvider>
                        <App />
                    </DesktopEditContextMenuProvider>
                    {/*
                     * Top end, not bottom: the bottom of every column is an
                     * input or a status row — the chat composer on the end
                     * side, the sidebar's activity row on the start side — and
                     * a toast is opaque and takes pointer events, so a
                     * bottom-anchored one covered the composer and swallowed
                     * clicks on it for its whole timeout. The top band is
                     * chrome, and `toast-region` clears it in the theme layer.
                     *
                     * 360 rather than HeroUI's 460: Haus's toasts are mostly
                     * one-line confirmations, and the few that carry a
                     * description still get a comfortable measure.
                     */}
                    <Toast.Provider placement="top end" width={360} />
                </DevModeProvider>
            </ThemeProvider>
        </HausClerkProvider>
    </StrictMode>
);

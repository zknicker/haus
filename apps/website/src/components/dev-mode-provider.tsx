import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { getDesktopBridge } from '../lib/desktop-bridge.ts';

/**
 * Dev Mode reveals message routing decisions and runtime details. Toggled
 * from Command-K or the desktop Developer menu; persisted per device.
 */

interface DevModeContextValue {
    devMode: boolean;
    setDevMode: (enabled: boolean) => void;
}

const storageKey = 'the-haus-dev-mode';
const DevModeContext = createContext<DevModeContextValue | null>(null);

function getStoredDevMode(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }
    return window.localStorage.getItem(storageKey) === 'on';
}

export function DevModeProvider({ children }: PropsWithChildren) {
    const [devMode, setDevModeState] = useState<boolean>(() => getStoredDevMode());

    const setDevMode = (enabled: boolean) => {
        window.localStorage.setItem(storageKey, enabled ? 'on' : 'off');
        setDevModeState(enabled);
    };

    useEffect(() => {
        // Through the bridge accessor, never `window` directly: the injected
        // global's name is a cross-version contract with the desktop shell.
        const unsubscribe = getDesktopBridge()?.onDevModeToggle?.(() => {
            setDevModeState((current) => {
                const next = !current;
                window.localStorage.setItem(storageKey, next ? 'on' : 'off');
                return next;
            });
        });
        return unsubscribe;
    }, []);

    return (
        <DevModeContext.Provider value={{ devMode, setDevMode }}>
            {children}
        </DevModeContext.Provider>
    );
}

export function useDevMode() {
    const context = useContext(DevModeContext);
    if (!context) {
        throw new Error('useDevMode must be used within DevModeProvider');
    }
    return context;
}

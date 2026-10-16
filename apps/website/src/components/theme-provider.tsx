import {
    createContext,
    type PropsWithChildren,
    startTransition,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from 'react';
import { useColorThemeSync } from '../hooks/shell/use-color-theme.ts';
import { useThemeAppIcon } from '../hooks/shell/use-theme-app-icon.ts';
import type { ColorTheme } from '../lib/color-theme.ts';
import { colorThemeDefinition } from '../lib/color-themes.ts';
import { getDesktopBridge } from '../lib/desktop-bridge.ts';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

interface ThemeContextValue {
    /** The mode the active color theme pins, overriding `theme`; `null` when none. */
    forcedTheme: ResolvedTheme | null;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: ThemePreference) => void;
    /** The stored Mode preference, kept as-is while a color theme pins the mode. */
    theme: ThemePreference;
}

const storageKey = 'the-haus-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The one owner of the document root's theme attributes: `data-theme`, `.dark`,
 * `colorScheme` (from the Mode preference, unless the color theme pins a mode)
 * and, through `useColorThemeSync`, `data-color-theme`. Mounted at the app root,
 * so every route resolves the same way.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
    const [theme, setThemeState] = useState<ThemePreference>(() => getStoredTheme());
    const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
    const colorTheme = useColorThemeSync();
    useThemeAppIcon();
    const forcedTheme = colorThemeDefinition(colorTheme).forcedMode;
    const resolvedTheme = resolveTheme(theme, colorTheme, systemTheme);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => setSystemTheme(getSystemTheme());
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Layout effect: lands with `data-color-theme` before paint, so a pinned mode never flashes.
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = resolvedTheme;
        root.style.colorScheme = resolvedTheme;
        root.classList.toggle('dark', resolvedTheme === 'dark');
    }, [resolvedTheme]);

    useEffect(() => {
        window.localStorage.setItem(storageKey, theme);
    }, [theme]);

    useEffect(() => {
        const nativeTheme = forcedTheme ?? (theme === 'system' ? null : theme);
        void getDesktopBridge()?.setTheme(nativeTheme);
    }, [forcedTheme, theme]);

    const value = useMemo<ThemeContextValue>(
        () => ({
            forcedTheme,
            resolvedTheme,
            setTheme: (nextTheme) => {
                startTransition(() => {
                    setThemeState(nextTheme);
                });
            },
            theme,
        }),
        [forcedTheme, resolvedTheme, theme]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider.');
    }

    return context;
}

// Non-throwing read for components that may render outside the provider (e.g.
// static markup in tests). Falls back to the app's default dark theme.
export function useResolvedThemeOptional(): ResolvedTheme {
    return useContext(ThemeContext)?.resolvedTheme ?? 'dark';
}

/** The mode in effect: a color theme's pinned mode, else the preference (System follows the OS). */
export function resolveTheme(
    preference: ThemePreference,
    colorTheme: ColorTheme,
    systemTheme: ResolvedTheme
): ResolvedTheme {
    return (
        colorThemeDefinition(colorTheme).forcedMode ??
        (preference === 'system' ? systemTheme : preference)
    );
}

function getSystemTheme(): ResolvedTheme {
    if (typeof window === 'undefined') {
        return 'dark';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): ThemePreference {
    if (typeof window === 'undefined') {
        return 'system';
    }

    const value = window.localStorage.getItem(storageKey);

    if (value === 'dark' || value === 'light' || value === 'system') {
        return value;
    }

    return 'system';
}

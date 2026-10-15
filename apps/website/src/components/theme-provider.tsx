import {
    createContext,
    type PropsWithChildren,
    startTransition,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { getDesktopBridge } from '../lib/desktop-bridge.ts';

export type ThemePreference = 'dark' | 'light' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

interface ThemeContextValue {
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: ThemePreference) => void;
    theme: ThemePreference;
}

const storageKey = 'the-haus-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

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

export function ThemeProvider({ children }: PropsWithChildren) {
    const [theme, setThemeState] = useState<ThemePreference>(() => getStoredTheme());
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
        const initialTheme = getStoredTheme();
        return initialTheme === 'system' ? getSystemTheme() : initialTheme;
    });

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const applyTheme = () => {
            const nextResolvedTheme = theme === 'system' ? getSystemTheme() : theme;

            document.documentElement.dataset.theme = nextResolvedTheme;
            document.documentElement.style.colorScheme = nextResolvedTheme;
            document.documentElement.classList.toggle('dark', nextResolvedTheme === 'dark');
            window.localStorage.setItem(storageKey, theme);
            setResolvedTheme(nextResolvedTheme);
            void getDesktopBridge()?.setTheme(theme === 'system' ? null : theme);
        };

        applyTheme();

        if (theme !== 'system') {
            return;
        }

        const handleChange = () => applyTheme();
        mediaQuery.addEventListener('change', handleChange);

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    const value = useMemo<ThemeContextValue>(
        () => ({
            resolvedTheme,
            setTheme: (nextTheme) => {
                startTransition(() => {
                    setThemeState(nextTheme);
                });
            },
            theme,
        }),
        [resolvedTheme, theme]
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

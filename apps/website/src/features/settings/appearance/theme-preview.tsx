import type { ReactNode } from 'react';
import type { ThemePreference } from '../../../components/theme-provider.tsx';
import type { ColorTheme } from '../../../lib/color-theme.ts';
import { colorThemeDefinition } from '../../../lib/color-themes.ts';
import type { ThemeMode } from '../../../lib/custom-themes.ts';
import { cn } from '../../../lib/utils.ts';

export function ThemePreview({ mode, theme }: { mode: ThemePreference; theme: ColorTheme }) {
    if (mode === 'system') {
        return (
            <PreviewWindow mode="light" theme={theme}>
                <PreviewWindow className="theme-preview__half" mode="dark" theme={theme} />
            </PreviewWindow>
        );
    }
    return <PreviewWindow mode={mode} theme={theme} />;
}

function PreviewWindow({
    children,
    className,
    mode,
    theme,
}: {
    children?: ReactNode;
    className?: string;
    mode: ThemeMode;
    theme: ColorTheme;
}) {
    const isPalette = colorThemeDefinition(theme).ground === 'palette';
    return (
        <div
            aria-hidden="true"
            className={cn('theme-preview', className)}
            data-color-theme={theme}
            data-palette={isPalette ? '' : undefined}
            data-theme={mode}
        >
            <div className="theme-preview__sidebar">
                <span className="theme-preview__row" />
                <span className="theme-preview__line" />
                <span className="theme-preview__line theme-preview__line--short" />
            </div>
            <div className="theme-preview__main">
                <span className="theme-preview__line theme-preview__line--title" />
                <span className="theme-preview__line" />
                <span className="theme-preview__line theme-preview__line--short" />
                <div className="theme-preview__composer">
                    <span className="theme-preview__send" />
                </div>
            </div>
            {children}
        </div>
    );
}

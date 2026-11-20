import { afterAll, expect, test } from 'bun:test';
import * as React from 'react';
import { parseCustomThemes } from '../../lib/custom-themes.ts';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { createRenderCensus } from '../../test-support/render-census.tsx';
import { getCustomThemes, saveCustomThemes } from './use-custom-themes.ts';

const colors = { accent: '#3b5de8', background: '#f2f2f4', foreground: '#1e1e20' };
saveCustomThemes(
    parseCustomThemes([{ dark: colors, id: 'custom-drag01', light: colors, name: 'Drag' }]),
    null
);

const restoreDom = installFakeDom();
afterAll(restoreDom);

const { getThemeBackground, previewThemeBackground, saveThemeBackground, useThemeBackground } =
    await import('./use-theme-background.ts');
const { useColorTheme } = await import('./use-color-theme.ts');
const { themeBackground, withAdjustment } = await import('../../lib/home-background.ts');
const { createRoot } = await import('react-dom/client');
const { act } = React;

function BlurProbe({ theme }: { theme: 'custom-drag01' | 'nord' }) {
    return <p>{useThemeBackground(theme).adjustments.blur}</p>;
}

function ThemeRootStandIn() {
    return <p>{useColorTheme()}</p>;
}

test('a slider drag previews live and persists only when it ends', async () => {
    const { census, CensusRoot, observe } = createRenderCensus();
    const container = document.createElement('div');
    observe(container);
    const root = createRoot(container);
    await act(() =>
        root.render(
            <CensusRoot>
                <ThemeRootStandIn />
                <BlurProbe theme="custom-drag01" />
                <BlurProbe theme="nord" />
            </CensusRoot>
        )
    );
    const stored = getCustomThemes();
    const dots = themeBackground('dots');
    census.reset();

    await act(() => previewThemeBackground('custom-drag01', withAdjustment(dots, 'blur', 40)));
    await act(() => previewThemeBackground('custom-drag01', withAdjustment(dots, 'blur', 41)));
    expect(container.textContent).toBe('default410');
    expect(getCustomThemes()).toBe(stored);
    expect(census.count('ThemeRootStandIn')).toBe(0);

    await act(() => previewThemeBackground('nord', withAdjustment(dots, 'blur', 12)));
    expect(getThemeBackground('nord').adjustments.blur).toBe(0);
    await act(() => saveThemeBackground('nord', withAdjustment(dots, 'blur', 13)));
    expect(getThemeBackground('nord').adjustments.blur).toBe(13);
    expect(container.textContent).toBe('default013');
    await act(() => root.unmount());
});

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { useLayoutContext } from '../../shell/use-layout-context.ts';
import { SettingsLayout } from './page.tsx';
import { type SettingsColumnWidth, SettingsPageColumn } from './settings-page-column.tsx';

describe('SettingsLayout', () => {
    test('forwards the app layout context to settings child routes', () => {
        const markup = renderSettingsRoute('form');

        expect(markup).toContain('settings context available');
    });

    test('reads settings rows in the narrow form column inside the shared page gutter', () => {
        const classes = columnClasses(renderSettingsRoute('form'));

        expect(classes).toContain('px-6');
        expect(classes).toContain('pt-8');
        expect(classes).toContain('gap-8');
        expect(classes).toContain('box-content');
        expect(classes).toContain('max-w-153');
        expect(classes).not.toContain('max-w-6xl');
        expect(classes).not.toContain('w-full');
    });

    test('reads table and catalog pages in the wider table column', () => {
        const classes = columnClasses(renderSettingsRoute('table'));

        expect(classes).toContain('box-content');
        expect(classes).toContain('max-w-212');
        expect(classes).not.toContain('max-w-153');
        expect(classes).not.toContain('max-w-6xl');
    });
});

function columnClasses(markup: string) {
    const column = markup.match(/class="([^"]*\bpx-6\b[^"]*)"/);
    expect(column).not.toBeNull();
    return (column?.[1] ?? '').split(/\s+/);
}

function renderSettingsRoute(width: SettingsColumnWidth) {
    return renderToStaticMarkup(
        <MemoryRouter initialEntries={['/settings/probe']}>
            <Routes>
                <Route element={<AppLayoutProbe />} path="/settings">
                    <Route element={<SettingsLayout />}>
                        <Route element={<SettingsChildProbe width={width} />} path="probe" />
                    </Route>
                </Route>
            </Routes>
        </MemoryRouter>
    );
}

function AppLayoutProbe() {
    return <Outlet context={{ navigateToSettings: () => undefined }} />;
}

function SettingsChildProbe({ width }: { width: SettingsColumnWidth }) {
    const context = useLayoutContext();

    return (
        <SettingsPageColumn width={width}>
            <span>{context ? 'settings context available' : 'missing context'}</span>
        </SettingsPageColumn>
    );
}
